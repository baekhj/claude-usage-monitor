const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');
const { getStats } = require('./parser');
const { JsonlWatcher } = require('./watcher');
const { formatDuration, formatTokens, formatCost } = require('../shared/utils');
const { REFRESH_INTERVAL_MS } = require('../shared/constants');
const settings = require('./settings');
const { getUsageFromAPI, getSubscriptionInfo } = require('./usage-api');
const { startUpdateChecker, checkForUpdates, downloadUpdate, installUpdate, openReleasePage } = require('./updater');

let appTray = null;   // app icon tray (leftmost)
let tray = null;      // text tray (middle)
let iconTray = null;  // pie icon tray (right)
let popupWindow = null;
let dashboardWindow = null;
let watcher = null;
let refreshTimer = null;
let usageTimer = null;
let latestApiUsage = null;

// Track which thresholds have already fired to avoid repeat notifications
let firedSessionThresholds = new Set();
let firedWeeklyThresholds = new Set();

// ── Tray Icon (pie charts only) ──
function pctColor(pct) {
  if (pct >= 80) return [248, 113, 113]; // red
  if (pct >= 60) return [251, 191, 36];  // yellow
  return [110, 231, 183];                // green
}

function drawPie(buf, totalW, h, offsetX, radius, pct) {
  const [r, g, b] = pctColor(pct);
  const cx = offsetX + radius, cy = h / 2;
  const fillRatio = Math.min(1, Math.max(0, pct / 100));

  for (let y = 0; y < h; y++) {
    for (let x = offsetX; x < offsetX + radius * 2; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * totalW + x) * 4;
      if (idx < 0 || idx + 3 >= buf.length) continue;

      if (dist <= radius && dist >= radius - 2) {
        buf[idx] = 160; buf[idx+1] = 160; buf[idx+2] = 180; buf[idx+3] = 180;
      } else if (dist < radius - 2) {
        const angle = Math.atan2(dx, -dy);
        const normalized = (angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2);
        const filled = pct >= 100 || normalized <= fillRatio;

        if (filled) {
          buf[idx] = r; buf[idx+1] = g; buf[idx+2] = b; buf[idx+3] = 220;
        } else {
          buf[idx] = 50; buf[idx+1] = 50; buf[idx+2] = 70; buf[idx+3] = 90;
        }
      }
    }
  }
}

function createTrayIcon(pct5h, pct7d) {
  const items = settings.get().menubar.items || [];
  const show5h = items.includes('icon5h');
  const show7d = items.includes('icon7d');

  const scale = 2;
  const pieSize = 14 * scale;
  const gap = 3 * scale;
  const count = (show5h ? 1 : 0) + (show7d ? 1 : 0);

  if (count === 0) return nativeImage.createEmpty();

  const totalW = count * pieSize + (count > 1 ? gap : 0);
  const h = 18 * scale;
  const buf = Buffer.alloc(totalW * h * 4);

  let offsetX = 0;
  if (show5h) {
    drawPie(buf, totalW, h, offsetX, pieSize / 2, pct5h ?? 0);
    offsetX += pieSize + gap;
  }
  if (show7d) {
    drawPie(buf, totalW, h, offsetX, pieSize / 2, pct7d ?? 0);
  }

  return nativeImage.createFromBuffer(buf, { width: totalW, height: h, scaleFactor: scale });
}

// ── Tray ──
function buildContextMenu() {
  return Menu.buildFromTemplate([
    { label: 'Refresh', click: () => refreshApiUsage() },
    { label: 'Dashboard', click: () => openDashboard() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  // 1. Icon tray (rightmost): colored pie charts
  iconTray = new Tray(createTrayIcon(0, 0));
  iconTray.on('click', (event, bounds) => togglePopup(bounds));
  iconTray.on('right-click', () => iconTray.popUpContextMenu(buildContextMenu()));

  // 2. Text tray (middle): system font for crisp rendering
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('Loading...', { fontType: 'monospacedDigit' });
  tray.on('click', (event, bounds) => togglePopup(bounds));
  tray.on('right-click', () => tray.popUpContextMenu(buildContextMenu()));

  // 3. App icon tray (leftmost): Template image for auto dark/light mode
  const iconPath = path.join(app.getAppPath(), 'assets', 'tray-iconTemplate.png');
  const appIcon = nativeImage.createFromPath(iconPath);
  appIcon.setTemplateImage(true);
  appTray = new Tray(appIcon);
  appTray.on('click', (event, bounds) => togglePopup(bounds));
  appTray.on('right-click', () => appTray.popUpContextMenu(buildContextMenu()));
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
function compactDuration(ms) {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  return `${m}m`;
}

function buildTrayTitle(stats) {
  const cfg = settings.get();
  const items = cfg.menubar.items;
  const pct = getApiPercent();
  const sep = cfg.menubar.separator || ' · ';
  const ITEMS = settings.MENUBAR_ITEMS;

  // Collect values per group, preserving item order
  const groups = { '5h': [], '7d': [] };
  const general = [];

  for (const item of items) {
    const meta = ITEMS[item];
    if (!meta || meta.type === 'icon') continue;

    let value = null;
    switch (item) {
      case 'usagePct':    value = pct ? `${pct.used}%` : '--%'; break;
      case 'remainPct':   value = pct ? `${pct.remaining}%` : '--%'; break;
      case 'weeklyPct':   value = pct ? `${pct.weekly}%` : '--%'; break;
      case 'tokens':      value = formatTokens(stats.block.totalTokens); break;
      case 'costBlock':   value = formatCost(stats.block.totalCost); break;
      case 'costToday':   value = formatCost(stats.today.totalCost); break;
      case 'remaining':
        if (pct?.sessionReset) value = compactDuration(pct.sessionReset - Date.now());
        else value = compactDuration(stats.block.remainingMs);
        break;
      case 'weeklyReset':
        if (pct?.weeklyReset) value = compactDuration(pct.weeklyReset - Date.now());
        else value = '--';
        break;
      case 'requests':    value = `${stats.block.requestCount}req`; break;
      case 'reqToday':    value = `${stats.today.requestCount}req`; break;
      case 'model': {
        const m = stats.block.lastModel;
        if (m) { const s = m.replace(/^claude-/, '').replace(/-\d.*$/, ''); value = s.charAt(0).toUpperCase() + s.slice(1); }
        break;
      }
      case 'plan': {
        const sub = getSubscriptionInfo();
        if (sub) {
          const type = (sub.subscriptionType || '').charAt(0).toUpperCase() + (sub.subscriptionType || '').slice(1);
          const tier = (sub.rateLimitTier || '');
          const label = tier.includes('5x') ? 'Max 5x' : tier.includes('20x') ? 'Max 20x' : '';
          value = label ? `${type} ${label}` : type;
        }
        break;
      }
    }

    if (value) {
      const group = meta.group;
      if (group && groups[group]) groups[group].push(value);
      else general.push(value);
    }
  }

  // Build sections: general items first, then 5H group, 7D group
  const sections = [...general];
  if (groups['5h'].length > 0) sections.push('5H ' + groups['5h'].join(' '));
  if (groups['7d'].length > 0) sections.push('7D ' + groups['7d'].join(' '));

  return sections.length > 0 ? sections.join(sep) : '--';
}

function updateTrayTitle(stats) {
  if (!tray) return;
  tray.setTitle(buildTrayTitle(stats), { fontType: 'monospacedDigit' });

  const pct = getApiPercent();
  if (iconTray) iconTray.setImage(createTrayIcon(pct?.used, pct?.weekly));
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

// ── Update state (persists across popup open/close) ──
let updateState = { status: 'idle', progress: null, result: null, error: null };
// status: idle | downloading | downloaded | error

function broadcastUpdateProgress(progress) {
  updateState.progress = progress;
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.webContents.send('update-progress', progress);
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('update-progress', progress);
}

ipcMain.handle('download-update', async () => {
  if (updateState.status === 'downloading') return { status: 'downloading' };
  if (updateState.status === 'downloaded') return updateState.result;

  updateState = { status: 'downloading', progress: null, result: null, error: null };
  try {
    const result = await downloadUpdate(broadcastUpdateProgress);
    updateState.status = 'downloaded';
    updateState.result = result;
    // Notify popup if it's open
    if (popupWindow && !popupWindow.isDestroyed()) popupWindow.webContents.send('update-state', updateState);
    if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('update-state', updateState);
    return result;
  } catch (e) {
    updateState.status = 'error';
    updateState.error = e.message;
    throw e;
  }
});

ipcMain.handle('get-update-state', () => updateState);
ipcMain.handle('install-update', (event, filePath) => installUpdate(filePath));
ipcMain.handle('open-release-page', () => openReleasePage());

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
