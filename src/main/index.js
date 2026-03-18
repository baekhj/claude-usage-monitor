const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');
const { getStats } = require('./parser');
const { JsonlWatcher } = require('./watcher');
const { formatDuration, formatTokens, formatCost } = require('../shared/utils');
const { REFRESH_INTERVAL_MS } = require('../shared/constants');
const settings = require('./settings');
const { getUsageFromAPI, getSubscriptionInfo } = require('./usage-api');
const { startUpdateChecker, checkForUpdates } = require('./updater');

let tray = null;
let popupWindow = null;
let dashboardWindow = null;
let watcher = null;
let refreshTimer = null;
let usageTimer = null;
let latestApiUsage = null;

// Track which thresholds have already fired to avoid repeat notifications
let firedSessionThresholds = new Set();
let firedWeeklyThresholds = new Set();

// ── Tray Icon ──
function createTrayIcon(usagePct) {
  // 16x16 @2x template icon — circle that fills based on usage
  const size = 18;
  const scale = 2;
  const canvas = Buffer.alloc(size * scale * size * scale * 4); // RGBA
  const w = size * scale;

  // Determine color based on usage
  let r = 110, g = 231, b = 183; // green
  if (usagePct >= 80) { r = 248; g = 113; b = 113; } // red
  else if (usagePct >= 60) { r = 251; g = 191; b = 36; } // yellow

  const cx = w / 2, cy = w / 2, radius = w / 2 - 2;
  const fillAngle = (usagePct / 100) * Math.PI * 2 - Math.PI / 2;

  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * w + x) * 4;

      if (dist <= radius && dist >= radius - 3) {
        // Ring outline
        canvas[idx] = 180; canvas[idx + 1] = 180; canvas[idx + 2] = 200; canvas[idx + 3] = 200;
      } else if (dist < radius - 3) {
        // Fill based on usage (pie-style from top)
        const angle = Math.atan2(dy, dx);
        if (usagePct >= 100 || angle <= fillAngle) {
          canvas[idx] = r; canvas[idx + 1] = g; canvas[idx + 2] = b; canvas[idx + 3] = 220;
        } else {
          canvas[idx] = 60; canvas[idx + 1] = 60; canvas[idx + 2] = 80; canvas[idx + 3] = 100;
        }
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: w, height: w, scaleFactor: scale });
}

// ── Tray ──
function createTray() {
  const icon = createTrayIcon(0);
  tray = new Tray(icon);
  tray.setTitle('Loading...');

  tray.on('click', (event, bounds) => {
    togglePopup(bounds);
  });

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Refresh', click: () => refreshApiUsage() },
      { label: 'Dashboard', click: () => openDashboard() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(contextMenu);
  });
}

// ── Popup ──
function createPopupWindow(bounds) {
  if (popupWindow) { popupWindow.close(); popupWindow = null; return; }

  popupWindow = new BrowserWindow({
    x: Math.round(bounds.x - 190),
    y: bounds.y + bounds.height,
    width: 380,
    height: 640,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popupWindow.loadFile(path.join(__dirname, '..', 'renderer', 'popup', 'popup.html'));
  popupWindow.once('ready-to-show', () => { popupWindow.show(); sendStatsToPopup(); });
  popupWindow.on('blur', () => { if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close(); });
  popupWindow.on('closed', () => { popupWindow = null; });
}

function togglePopup(bounds) {
  if (popupWindow) { popupWindow.close(); popupWindow = null; }
  else createPopupWindow(bounds);
}

// ── Dashboard ──
function openDashboard() {
  if (dashboardWindow) { dashboardWindow.focus(); return; }

  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard', 'index.html'));
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

// ── API Percent ──
function getApiPercent() {
  if (latestApiUsage?.available && latestApiUsage.data) {
    const d = latestApiUsage.data;
    if (typeof d.sessionUtilization === 'number') {
      return {
        used: Math.round(d.sessionUtilization * 100),
        remaining: Math.round((1 - d.sessionUtilization) * 100),
        weekly: Math.round(d.weeklyUtilization * 100),
        weeklyRemaining: Math.round((1 - d.weeklyUtilization) * 100),
        sessionReset: d.sessionReset,
        weeklyReset: d.weeklyReset,
        source: 'api',
      };
    }
  }
  return null;
}

// ── Notifications ──
function checkAndNotify(pct) {
  if (!pct) return;
  const cfg = settings.get().notifications;
  if (!cfg?.enabled) return;

  // 5h thresholds
  for (const threshold of (cfg.thresholds || [])) {
    if (pct.used >= threshold && !firedSessionThresholds.has(threshold)) {
      firedSessionThresholds.add(threshold);
      showNotification(
        `5h Usage: ${pct.used}%`,
        `You've used ${pct.used}% of your 5-hour limit. Resets in ${formatDuration(pct.sessionReset - Date.now())}.`
      );
    }
  }

  // 7d thresholds
  for (const threshold of (cfg.weeklyThresholds || [])) {
    if (pct.weekly >= threshold && !firedWeeklyThresholds.has(threshold)) {
      firedWeeklyThresholds.add(threshold);
      showNotification(
        `7d Usage: ${pct.weekly}%`,
        `You've used ${pct.weekly}% of your weekly limit.`
      );
    }
  }

  // Reset fired thresholds when usage drops (e.g. after reset)
  if (pct.used < Math.min(...(cfg.thresholds || [100]))) {
    firedSessionThresholds.clear();
  }
  if (pct.weekly < Math.min(...(cfg.weeklyThresholds || [100]))) {
    firedWeeklyThresholds.clear();
  }
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

// ── Menubar ──
function buildTrayTitle(stats) {
  const cfg = settings.get();
  const items = cfg.menubar.items;
  const sep = cfg.menubar.separator;
  const pct = getApiPercent();

  const parts = [];
  for (const item of items) {
    switch (item) {
      case 'usagePct':    parts.push(pct ? `${pct.used}%` : '--%'); break;
      case 'remainPct':   parts.push(pct ? `${pct.remaining}%` : '--%'); break;
      case 'weeklyPct':   parts.push(pct ? `7d:${pct.weekly}%` : '7d:--%'); break;
      case 'tokens':      parts.push(formatTokens(stats.block.totalTokens)); break;
      case 'costBlock':   parts.push(formatCost(stats.block.totalCost)); break;
      case 'costToday':   parts.push(formatCost(stats.today.totalCost)); break;
      case 'remaining':
        if (pct?.sessionReset) parts.push(formatDuration(pct.sessionReset - Date.now()));
        else parts.push(formatDuration(stats.block.remainingMs));
        break;
      case 'requests':    parts.push(`${stats.block.requestCount}req`); break;
      case 'reqToday':    parts.push(`${stats.today.requestCount}req`); break;
      case 'model': {
        const m = stats.block.lastModel;
        if (m) { const s = m.replace(/^claude-/, '').replace(/-\d.*$/, ''); parts.push(s.charAt(0).toUpperCase() + s.slice(1)); }
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join(sep) : '--';
}

function updateTrayTitle(stats) {
  if (!tray) return;
  tray.setTitle(buildTrayTitle(stats));

  // Update icon based on usage
  const pct = getApiPercent();
  if (pct) {
    tray.setImage(createTrayIcon(pct.used));
  }
}

// ── Data flow ──
function sendStatsToPopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    const stats = getStats();
    const cfg = settings.get();
    popupWindow.webContents.send('stats-update', {
      stats: JSON.parse(JSON.stringify(stats)),
      settings: cfg,
      apiUsage: latestApiUsage,
      percent: getApiPercent(),
    });
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    const stats = getStats();
    const cfg = settings.get();
    dashboardWindow.webContents.send('stats-update', {
      stats: JSON.parse(JSON.stringify(stats)),
      settings: cfg,
      apiUsage: latestApiUsage,
      percent: getApiPercent(),
    });
  }
}

function updateStats() {
  const stats = getStats();
  updateTrayTitle(stats);
  sendStatsToPopup();
}

async function refreshApiUsage() {
  latestApiUsage = await getUsageFromAPI();
  checkAndNotify(getApiPercent());
  updateStats();
}

// ── Auto-start ──
function applyLaunchAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

// ── Timer ──
function restartUsageTimer() {
  if (usageTimer) clearInterval(usageTimer);
  const sec = settings.get().apiRefreshSeconds || 300;
  usageTimer = setInterval(refreshApiUsage, sec * 1000);
}

// ── IPC ──
ipcMain.handle('get-stats', () => {
  const stats = getStats();
  return {
    stats: JSON.parse(JSON.stringify(stats)),
    settings: settings.get(),
    apiUsage: latestApiUsage,
    percent: getApiPercent(),
  };
});

ipcMain.handle('get-settings', () => settings.get());

ipcMain.handle('update-settings', (event, partial) => {
  const updated = settings.update(partial);
  if (partial.apiRefreshSeconds) restartUsageTimer();
  if (partial.launchAtLogin !== undefined) applyLaunchAtLogin(partial.launchAtLogin);
  updateStats();
  return updated;
});

ipcMain.handle('get-menubar-items', () => settings.MENUBAR_ITEMS);
ipcMain.handle('get-subscription-info', () => getSubscriptionInfo());
ipcMain.handle('refresh-api-usage', async () => { await refreshApiUsage(); return latestApiUsage; });
ipcMain.handle('open-dashboard', () => openDashboard());
ipcMain.handle('check-for-updates', () => checkForUpdates());

// ── App lifecycle ──
app.whenReady().then(() => {
  app.dock?.hide();

  // Apply saved launch-at-login setting
  const cfg = settings.get();
  applyLaunchAtLogin(cfg.launchAtLogin);

  createTray();
  updateStats();

  refreshApiUsage();
  restartUsageTimer();
  startUpdateChecker();

  watcher = new JsonlWatcher(() => updateStats());
  watcher.start();

  refreshTimer = setInterval(updateStats, REFRESH_INTERVAL_MS);
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  if (watcher) watcher.stop();
  if (refreshTimer) clearInterval(refreshTimer);
  if (usageTimer) clearInterval(usageTimer);
});
