// ── Formatters ──
function formatTokens(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatCost(usd) {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatResetTime(resetMs) {
  if (!resetMs) return '--';
  const remaining = resetMs - Date.now();
  if (remaining <= 0) return 'now';
  return 'resets in ' + formatDuration(remaining);
}

function modelClass(name) {
  if (name.includes('opus')) return 'opus';
  if (name.includes('sonnet')) return 'sonnet';
  if (name.includes('haiku')) return 'haiku';
  return 'unknown';
}

function shortModelName(name) {
  const cls = modelClass(name);
  if (cls === 'unknown') return name;
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}

function formatInterval(seconds) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60 ? (seconds % 60) + 's' : ''}`.trim();
  return `${seconds}s`;
}

// ── State ──
let currentStats = null;
let currentSettings = null;
let currentPercent = null;
let allMenubarItems = {};
let allPillColors = {};

// ── Plan Badge ──
function formatPlan(sub) {
  if (!sub) return '';
  const type = (sub.subscriptionType || '').replace(/_/g, ' ');
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  const tier = sub.rateLimitTier || '';
  const tierLabel = tier.includes('5x') ? 'Max 5x' : tier.includes('20x') ? 'Max 20x' : '';
  return tierLabel ? `${name} · ${tierLabel}` : name;
}

// ── Main View ──
function updateUI({ stats, settings, apiUsage, percent }) {
  currentStats = stats;
  currentSettings = settings;
  currentPercent = percent;

  const block = stats.block;
  const today = stats.today;

  // === API Usage Card ===
  if (percent) {
    document.getElementById('usage-5h').textContent = `${percent.used}%`;
    document.getElementById('usage-5h').className = 'usage-pct' + pctColorClass(percent.used);

    const p5h = document.getElementById('progress-5h');
    p5h.style.width = `${percent.used}%`;
    p5h.className = 'progress-fill' + (percent.used >= 80 ? ' danger' : percent.used >= 60 ? ' warning' : '');

    document.getElementById('reset-5h').textContent = formatResetTime(percent.sessionReset);

    document.getElementById('usage-7d').textContent = `${percent.weekly}%`;
    document.getElementById('usage-7d').className = 'usage-pct' + pctColorClass(percent.weekly);

    const p7d = document.getElementById('progress-7d');
    p7d.style.width = `${percent.weekly}%`;
    p7d.className = 'progress-fill' + (percent.weekly >= 80 ? ' danger' : percent.weekly >= 60 ? ' warning' : '');

    document.getElementById('reset-7d').textContent = formatResetTime(percent.weeklyReset);
  } else {
    document.getElementById('usage-5h').textContent = '--%';
    document.getElementById('usage-7d').textContent = '--%';
    document.getElementById('reset-5h').textContent = 'waiting for API...';
    document.getElementById('reset-7d').textContent = '';
  }

  // === Block detail ===
  document.getElementById('block-remaining').textContent =
    percent?.sessionReset ? formatDuration(percent.sessionReset - Date.now()) : formatDuration(block.remainingMs);

  document.getElementById('block-input').textContent = formatTokens(block.totalInput);
  document.getElementById('block-output').textContent = formatTokens(block.totalOutput);
  document.getElementById('block-cost').textContent = formatCost(block.totalCost);
  document.getElementById('block-requests').textContent = block.requestCount;

  // === Today ===
  document.getElementById('today-input').textContent = formatTokens(today.totalInput);
  document.getElementById('today-output').textContent = formatTokens(today.totalOutput);
  document.getElementById('today-cost').textContent = formatCost(today.totalCost);
  document.getElementById('today-requests').textContent = today.requestCount;

  // Model breakdowns
  renderModelBreakdown('block-models', block.byModel);
  renderModelBreakdown('today-models', today.byModel);

  // Weekly chart
  renderWeeklyChart(stats.weekly);

  // Refresh time
  document.getElementById('refresh-time').textContent =
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function pctColorClass(pct) {
  if (pct >= 80) return ' danger';
  if (pct >= 60) return ' warning';
  return '';
}

function renderModelBreakdown(containerId, byModel) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!byModel || Object.keys(byModel).length === 0) return;

  const maxCost = Math.max(...Object.values(byModel).map(m => m.totalCost), 0.001);
  const sorted = Object.entries(byModel).sort((a, b) => b[1].totalCost - a[1].totalCost);

  for (const [model, data] of sorted) {
    const cls = modelClass(model);
    const row = document.createElement('div');
    row.className = 'model-row';
    row.innerHTML = `
      <span class="model-name ${cls}">${shortModelName(model)}</span>
      <div class="model-bar-wrap">
        <div class="model-bar ${cls}" style="width: ${(data.totalCost / maxCost * 100).toFixed(1)}%"></div>
      </div>
      <span class="model-stat">${formatTokens(data.totalInput + data.totalOutput)}</span>
      <span class="model-stat">${formatCost(data.totalCost)}</span>
      <span class="model-stat">${data.requestCount}req</span>
    `;
    container.appendChild(row);
  }
}

function renderWeeklyChart(weekly) {
  const container = document.getElementById('weekly-chart');
  container.innerHTML = '';
  const maxCost = Math.max(...weekly.map((d) => d.totalCost), 0.001);
  const todayStr = new Date().toDateString();

  for (const day of weekly) {
    const barHeight = Math.max(2, (day.totalCost / maxCost) * 60);
    const isToday = new Date(day.date).toDateString() === todayStr;
    const wrap = document.createElement('div');
    wrap.className = 'chart-bar-wrap';

    wrap.innerHTML = `
      <span class="chart-cost">${day.totalCost > 0 ? formatCost(day.totalCost) : ''}</span>
      <div class="chart-bar-container">
        <div class="chart-bar${isToday ? ' today' : ''}" style="height:${barHeight}px"></div>
      </div>
      <span class="chart-label">${day.label}</span>
    `;
    container.appendChild(wrap);
  }
}

// ── Settings View ──
function showSettings() {
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('settings-view').classList.remove('hidden');
  renderSettingsList();
  renderSeparatorOptions();
  renderRefreshInput();
  renderNotifSettings();
  renderGeneralSettings();
  updatePreview();
}

function hideSettings() {
  document.getElementById('settings-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
}

const GROUP_ORDER = ['general', '5h', '7d'];

function renderSettingsList() {
  const enabled = currentSettings?.menubar?.items || [];
  const allKeys = Object.keys(allMenubarItems);

  for (const g of GROUP_ORDER) {
    const listEl = document.getElementById(`menubar-${g}-list`);
    listEl.innerHTML = '';

    // Get keys belonging to this group
    const groupKeys = allKeys.filter(k => (allMenubarItems[k].group || 'general') === g);

    // Sort: enabled first (in configured order), then disabled
    const enabledInGroup = enabled.filter(k => groupKeys.includes(k));
    const disabledInGroup = groupKeys.filter(k => !enabled.includes(k));
    const sorted = [...enabledInGroup, ...disabledInGroup];
    const textKeys = sorted.filter(k => allMenubarItems[k].type !== 'icon');

    for (const key of sorted) {
      const meta = allMenubarItems[key];
      if (!meta) continue;
      const isChecked = enabled.includes(key);
      const isIcon = meta.type === 'icon';
      const textIdx = textKeys.indexOf(key);

      const item = document.createElement('div');
      item.className = 'settings-item';
      item.dataset.key = key;

      let moveHtml = '';
      if (!isIcon && textKeys.length > 1) {
        moveHtml = `
          <div class="move-btns">
            <button class="move-btn up" ${textIdx === 0 ? 'disabled' : ''} title="Move up">▲</button>
            <button class="move-btn down" ${textIdx === textKeys.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
          </div>
        `;
      }

      item.innerHTML = `
        ${moveHtml}
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-key="${key}">
        <span class="item-label">${isIcon ? '🟢 ' : ''}${meta.label}</span>
      `;

      item.querySelector('input').addEventListener('change', (e) => onToggleItem(key, e.target.checked));
      if (!isIcon) {
        item.querySelector('.move-btn.up')?.addEventListener('click', () => onMoveItem(key, -1));
        item.querySelector('.move-btn.down')?.addEventListener('click', () => onMoveItem(key, 1));
      }
      listEl.appendChild(item);
    }
  }
}

async function onMoveItem(key, direction) {
  const items = [...(currentSettings?.menubar?.items || [])];
  const meta = allMenubarItems[key];
  if (!meta) return;
  const group = meta.group || 'general';

  // Get text items in the same group
  const sameGroupText = items.filter(k => {
    const m = allMenubarItems[k];
    return m && m.type !== 'icon' && (m.group || 'general') === group;
  });

  const idx = sameGroupText.indexOf(key);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= sameGroupText.length) return;

  // Swap in the full items array
  const actualIdx = items.indexOf(key);
  const swapKey = sameGroupText[newIdx];
  const actualSwapIdx = items.indexOf(swapKey);
  [items[actualIdx], items[actualSwapIdx]] = [items[actualSwapIdx], items[actualIdx]];

  currentSettings = await window.api.updateSettings({ menubar: { ...currentSettings.menubar, items } });
  renderSettingsList();
  updatePreview();
}

function renderSeparatorOptions() {
  const current = currentSettings?.menubar?.separator || ' \u00B7 ';
  document.querySelectorAll('.sep-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sep === current);
  });
}

function renderRefreshInput() {
  const input = document.getElementById('refresh-input');
  const val = currentSettings?.apiRefreshSeconds || 300;
  input.value = val;
  document.getElementById('refresh-display').textContent = formatInterval(val);
}

async function onToggleItem(key, checked) {
  const items = [...(currentSettings?.menubar?.items || [])];
  if (checked && !items.includes(key)) items.push(key);
  else if (!checked) { const i = items.indexOf(key); if (i >= 0) items.splice(i, 1); }
  currentSettings = await window.api.updateSettings({ menubar: { ...currentSettings.menubar, items } });
  renderSettingsList();
  updatePreview();
}

async function onReorder(fromKey, toKey) {
  const items = [...(currentSettings?.menubar?.items || [])];
  const fi = items.indexOf(fromKey), ti = items.indexOf(toKey);
  if (fi < 0) { if (ti >= 0) items.splice(ti, 0, fromKey); else items.push(fromKey); }
  else if (ti < 0) return;
  else { items.splice(fi, 1); items.splice(items.indexOf(toKey), 0, fromKey); }
  currentSettings = await window.api.updateSettings({ menubar: { ...currentSettings.menubar, items } });
  renderSettingsList();
  updatePreview();
}

function updatePreview() {
  const el = document.getElementById('menubar-preview');
  if (!currentStats || !currentSettings) { el.textContent = '--'; return; }
  const items = currentSettings.menubar.items;
  const sep = currentSettings.menubar.separator;
  const pct = currentPercent;
  const stats = currentStats;

  const groups = { '5h': [], '7d': [] };
  const general = [];

  for (const item of items) {
    const meta = allMenubarItems[item];
    if (!meta || meta.type === 'icon') continue;

    let value = null;
    switch (item) {
      case 'usagePct': value = pct ? `${pct.used}%` : '--%'; break;
      case 'remainPct': value = pct ? `${pct.remaining}%` : '--%'; break;
      case 'weeklyPct': value = pct ? `${pct.weekly}%` : '--%'; break;
      case 'tokens': value = formatTokens(stats.block.totalTokens); break;
      case 'costBlock': value = formatCost(stats.block.totalCost); break;
      case 'costToday': value = formatCost(stats.today.totalCost); break;
      case 'remaining': value = pct?.sessionReset ? formatDuration(pct.sessionReset - Date.now()) : formatDuration(stats.block.remainingMs); break;
      case 'weeklyReset': value = pct?.weeklyReset ? formatDuration(pct.weeklyReset - Date.now()) : '--'; break;
      case 'requests': value = `${stats.block.requestCount}req`; break;
      case 'reqToday': value = `${stats.today.requestCount}req`; break;
      case 'model': { const m = stats.block.lastModel; if (m) value = shortModelName(m); break; }
      case 'plan': { /* plan not shown in preview */ break; }
    }

    if (value) {
      const group = meta.group;
      if (group && groups[group]) groups[group].push(value);
      else general.push(value);
    }
  }

  const sections = [...general];
  if (groups['5h'].length > 0) sections.push('5H ' + groups['5h'].join(' '));
  if (groups['7d'].length > 0) sections.push('7D ' + groups['7d'].join(' '));

  el.textContent = sections.length > 0 ? sections.join(sep) : '(empty)';
}

// ── Event Listeners ──
document.querySelectorAll('.sep-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    currentSettings = await window.api.updateSettings({ menubar: { ...currentSettings.menubar, separator: btn.dataset.sep } });
    renderSeparatorOptions();
    updatePreview();
  });
});

// Refresh interval input
let refreshTimer = null;
document.getElementById('refresh-input').addEventListener('input', (e) => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const val = Math.max(10, parseInt(e.target.value, 10) || 300);
    e.target.value = val;
    document.getElementById('refresh-display').textContent = formatInterval(val);
    currentSettings = await window.api.updateSettings({ apiRefreshSeconds: val });
  }, 500);
});

// Notification settings
function renderNotifSettings() {
  const n = currentSettings?.notifications || {};
  document.getElementById('notif-enabled').checked = n.enabled !== false;
  document.getElementById('notif-thresholds').value = (n.thresholds || [50,75,90]).join(', ');
  document.getElementById('notif-weekly').value = (n.weeklyThresholds || [75,90]).join(', ');
}

function parseThresholds(str) {
  return str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0 && n <= 100);
}

document.getElementById('notif-enabled').addEventListener('change', async (e) => {
  currentSettings = await window.api.updateSettings({ notifications: { enabled: e.target.checked } });
});

let notifTimer1 = null, notifTimer2 = null;
document.getElementById('notif-thresholds').addEventListener('input', (e) => {
  clearTimeout(notifTimer1);
  notifTimer1 = setTimeout(async () => {
    const vals = parseThresholds(e.target.value);
    if (vals.length) currentSettings = await window.api.updateSettings({ notifications: { thresholds: vals } });
  }, 800);
});

document.getElementById('notif-weekly').addEventListener('input', (e) => {
  clearTimeout(notifTimer2);
  notifTimer2 = setTimeout(async () => {
    const vals = parseThresholds(e.target.value);
    if (vals.length) currentSettings = await window.api.updateSettings({ notifications: { weeklyThresholds: vals } });
  }, 800);
});

// General settings
function renderGeneralSettings() {
  document.getElementById('launch-login').checked = currentSettings?.launchAtLogin || false;
  renderPillColors();
}

function renderPillColors() {
  const pillColors = currentSettings?.menubar?.pillColors || {};
  document.querySelectorAll('.pill-color-row').forEach(row => {
    const group = row.dataset.group;
    const container = row.querySelector('.pill-color-swatches');
    container.innerHTML = '';
    const current = pillColors[group] || 'default';

    for (const [key, val] of Object.entries(allPillColors)) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (key === current ? ' active' : '') + (key === 'none' ? ' none' : '');
      if (key !== 'none') swatch.style.background = val.swatch;
      swatch.title = key === 'none' ? 'Off' : key;
      swatch.addEventListener('click', async () => {
        const colors = { ...(currentSettings.menubar.pillColors || {}), [group]: key };
        currentSettings = await window.api.updateSettings({ menubar: { ...currentSettings.menubar, pillColors: colors } });
        renderPillColors();
      });
      container.appendChild(swatch);
    }
  });
}

document.getElementById('launch-login').addEventListener('change', async (e) => {
  currentSettings = await window.api.updateSettings({ launchAtLogin: e.target.checked });
});


document.getElementById('settings-btn').addEventListener('click', showSettings);
document.getElementById('settings-back').addEventListener('click', hideSettings);

// ── Update ──
let updateState = { status: 'idle', info: null, downloadResult: null }; // idle | checking | available | downloading | downloaded | upToDate | error

function renderUpdateUI() {
  const statusEl = document.getElementById('update-status');
  const actionsEl = document.getElementById('update-actions');
  const progressWrap = document.getElementById('update-progress-wrap');
  const versionEl = document.getElementById('update-version');

  versionEl.textContent = `v${updateState.info?.current || '--'}`;
  progressWrap.classList.add('hidden');

  switch (updateState.status) {
    case 'idle':
      statusEl.innerHTML = '<span class="update-msg">Click to check for updates</span>';
      actionsEl.innerHTML = '<button id="btn-check-update" class="update-btn">Check for Updates</button>';
      break;
    case 'checking':
      statusEl.innerHTML = '<span class="update-msg">Checking for updates...</span>';
      actionsEl.innerHTML = '<button class="update-btn" disabled>Checking...</button>';
      break;
    case 'upToDate':
      statusEl.innerHTML = '<span class="update-msg">You\'re on the latest version.</span>';
      actionsEl.innerHTML = '<button id="btn-check-update" class="update-btn secondary">Check Again</button>';
      break;
    case 'available': {
      const info = updateState.info;
      let html = `<span class="update-msg available">New version available: ${info.latest}</span>`;
      if (info.releaseNotes) {
        html += `<div class="update-release-notes">${escapeHtml(info.releaseNotes)}</div>`;
      }
      statusEl.innerHTML = html;
      actionsEl.innerHTML = `
        <button id="btn-download-update" class="update-btn">Download</button>
        <button id="btn-release-page" class="update-btn secondary">Release Page</button>
      `;
      break;
    }
    case 'downloading':
      statusEl.innerHTML = '<span class="update-msg">Downloading update...</span>';
      progressWrap.classList.remove('hidden');
      actionsEl.innerHTML = '<button class="update-btn" disabled>Downloading...</button>';
      break;
    case 'downloaded':
      statusEl.innerHTML = '<span class="update-msg available">Download complete. Ready to install.</span>';
      actionsEl.innerHTML = `
        <button id="btn-install-update" class="update-btn">Quit & Install</button>
        <button id="btn-release-page" class="update-btn secondary">Release Page</button>
      `;
      break;
    case 'error':
      statusEl.innerHTML = `<span class="update-msg error">Error: ${escapeHtml(updateState.errorMsg || 'Unknown error')}</span>`;
      actionsEl.innerHTML = '<button id="btn-check-update" class="update-btn">Try Again</button>';
      break;
  }

  bindUpdateButtons();
}

function bindUpdateButtons() {
  const checkBtn = document.getElementById('btn-check-update');
  const downloadBtn = document.getElementById('btn-download-update');
  const installBtn = document.getElementById('btn-install-update');
  const releaseBtn = document.getElementById('btn-release-page');

  if (checkBtn) checkBtn.addEventListener('click', onCheckUpdate);
  if (downloadBtn) downloadBtn.addEventListener('click', onDownloadUpdate);
  if (installBtn) installBtn.addEventListener('click', onInstallUpdate);
  if (releaseBtn) releaseBtn.addEventListener('click', () => window.api.openReleasePage());
}

async function onCheckUpdate() {
  updateState.status = 'checking';
  renderUpdateUI();
  try {
    const result = await window.api.checkForUpdates();
    updateState.info = result;
    if (result.error) {
      updateState.status = 'error';
      updateState.errorMsg = result.error;
    } else if (result.available) {
      updateState.status = 'available';
    } else {
      updateState.status = 'upToDate';
    }
  } catch (e) {
    updateState.status = 'error';
    updateState.errorMsg = e.message;
  }
  renderUpdateUI();
}

async function onDownloadUpdate() {
  updateState.status = 'downloading';
  renderUpdateUI();
  // Don't await — let it run in background even if popup closes
  window.api.downloadUpdate().then((result) => {
    updateState.downloadResult = result;
    updateState.status = 'downloaded';
    renderUpdateUI();
  }).catch((e) => {
    updateState.status = 'error';
    updateState.errorMsg = e.message;
    renderUpdateUI();
  });
}

async function onInstallUpdate() {
  if (!updateState.downloadResult?.filePath) return;
  try {
    await window.api.installUpdate(updateState.downloadResult.filePath);
  } catch (e) {
    updateState.status = 'error';
    updateState.errorMsg = e.message;
    renderUpdateUI();
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.api.onUpdateProgress((progress) => {
  updateState.status = 'downloading';
  const bar = document.getElementById('update-progress-bar');
  const text = document.getElementById('update-progress-text');
  const progressWrap = document.getElementById('update-progress-wrap');
  if (progressWrap) progressWrap.classList.remove('hidden');
  if (bar) bar.style.width = `${progress.percent}%`;
  if (text) {
    if (progress.total > 0) {
      const mb = (progress.downloaded / (1024 * 1024)).toFixed(1);
      const totalMb = (progress.total / (1024 * 1024)).toFixed(1);
      text.textContent = `${mb}/${totalMb} MB`;
    } else {
      text.textContent = `${progress.percent}%`;
    }
  }
});

// Listen for background download completion
window.api.onUpdateState((state) => {
  if (state.status === 'downloaded' && state.result) {
    updateState.status = 'downloaded';
    updateState.downloadResult = state.result;
    renderUpdateUI();
  } else if (state.status === 'error') {
    updateState.status = 'error';
    updateState.errorMsg = state.error;
    renderUpdateUI();
  }
});

// ── Init ──
(async () => {
  allMenubarItems = await window.api.getMenubarItems();
  allPillColors = await window.api.getPillColors();
  const data = await window.api.getStats();
  updateUI(data);

  // Plan badge
  const sub = await window.api.getSubscriptionInfo();
  const badge = document.getElementById('plan-badge');
  if (badge && sub) badge.textContent = formatPlan(sub);

  // Restore download state from main process
  const mainState = await window.api.getUpdateState();
  if (mainState.status === 'downloading') {
    const info = await window.api.checkForUpdates();
    updateState.info = info;
    updateState.status = 'downloading';
    if (mainState.progress) {
      // Show last known progress
      setTimeout(() => {
        const bar = document.getElementById('update-progress-bar');
        const text = document.getElementById('update-progress-text');
        if (bar) bar.style.width = `${mainState.progress.percent}%`;
        if (text) text.textContent = `${mainState.progress.percent}%`;
      }, 50);
    }
    renderUpdateUI();
    return;
  }
  if (mainState.status === 'downloaded' && mainState.result) {
    const info = await window.api.checkForUpdates();
    updateState.info = info;
    updateState.downloadResult = mainState.result;
    updateState.status = 'downloaded';
    renderUpdateUI();
    return;
  }

  // Normal: check for updates
  const info = await window.api.checkForUpdates();
  updateState.info = info;
  if (info?.error) {
    updateState.status = 'idle';
  } else if (info?.available) {
    updateState.status = 'available';
  } else {
    updateState.status = 'upToDate';
  }
  renderUpdateUI();
})();

window.api.onStatsUpdate(updateUI);
