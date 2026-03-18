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

function renderSettingsList() {
  const list = document.getElementById('menubar-items-list');
  list.innerHTML = '';
  const enabled = currentSettings?.menubar?.items || [];
  const allKeys = Object.keys(allMenubarItems);
  const orderedKeys = [...enabled, ...allKeys.filter(k => !enabled.includes(k))];

  for (const key of orderedKeys) {
    const meta = allMenubarItems[key];
    if (!meta) continue;
    const isChecked = enabled.includes(key);
    const item = document.createElement('div');
    item.className = 'settings-item';
    item.draggable = true;
    item.dataset.key = key;

    item.innerHTML = `
      <span class="drag-handle">\u2261</span>
      <input type="checkbox" ${isChecked ? 'checked' : ''} data-key="${key}">
      <span class="item-label">${meta.label}</span>
    `;

    item.querySelector('input').addEventListener('change', (e) => onToggleItem(key, e.target.checked));
    item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', key); item.classList.add('dragging'); });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', (e) => { e.preventDefault(); const fk = e.dataTransfer.getData('text/plain'); if (fk !== key) onReorder(fk, key); });
    list.appendChild(item);
  }
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
  const parts = [];

  for (const item of items) {
    switch (item) {
      case 'usagePct': parts.push(pct ? `${pct.used}%` : '--%'); break;
      case 'remainPct': parts.push(pct ? `${pct.remaining}%` : '--%'); break;
      case 'weeklyPct': parts.push(pct ? `7d:${pct.weekly}%` : '7d:--%'); break;
      case 'tokens': parts.push(formatTokens(stats.block.totalTokens)); break;
      case 'costBlock': parts.push(formatCost(stats.block.totalCost)); break;
      case 'costToday': parts.push(formatCost(stats.today.totalCost)); break;
      case 'remaining': parts.push(pct?.sessionReset ? formatDuration(pct.sessionReset - Date.now()) : formatDuration(stats.block.remainingMs)); break;
      case 'requests': parts.push(`${stats.block.requestCount}req`); break;
      case 'reqToday': parts.push(`${stats.today.requestCount}req`); break;
      case 'model': { const m = stats.block.lastModel; if (m) parts.push(shortModelName(m)); break; }
    }
  }
  el.textContent = parts.length > 0 ? parts.join(sep) : '(empty)';
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
}

document.getElementById('launch-login').addEventListener('change', async (e) => {
  currentSettings = await window.api.updateSettings({ launchAtLogin: e.target.checked });
});

document.getElementById('settings-btn').addEventListener('click', showSettings);
document.getElementById('settings-back').addEventListener('click', hideSettings);

// ── Init ──
(async () => {
  allMenubarItems = await window.api.getMenubarItems();
  const data = await window.api.getStats();
  updateUI(data);
})();

window.api.onStatsUpdate(updateUI);
