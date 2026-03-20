const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  menubar: {
    items: ['icon5h', 'icon7d', 'usagePct', 'remaining', 'costToday'],
    separator: ' · ',
  },
  apiRefreshSeconds: 300,
  notifications: {
    enabled: true,
    thresholds: [50, 75, 90],
    weeklyThresholds: [75, 90],
  },
  launchAtLogin: false,
};

const MENUBAR_ITEMS = {
  icon5h:      { label: '5h Pie Icon',        key: 'icon5h',      type: 'icon' },
  icon7d:      { label: '7d Pie Icon',        key: 'icon7d',      type: 'icon' },
  usagePct:    { label: '5h Usage %',         key: 'usagePct',    type: 'text' },
  remainPct:   { label: '5h Remaining %',     key: 'remainPct',   type: 'text' },
  weeklyPct:   { label: '7d Usage %',         key: 'weeklyPct',   type: 'text' },
  tokens:      { label: 'Block Tokens',       key: 'tokens',      type: 'text' },
  costBlock:   { label: 'Block Cost',         key: 'costBlock',   type: 'text' },
  costToday:   { label: 'Today Cost',         key: 'costToday',   type: 'text' },
  remaining:   { label: '5h Reset In',        key: 'remaining',   type: 'text' },
  weeklyReset: { label: '7d Reset In',        key: 'weeklyReset', type: 'text' },
  requests:    { label: 'Block Requests',     key: 'requests',    type: 'text' },
  reqToday:    { label: 'Today Requests',     key: 'reqToday',    type: 'text' },
  model:       { label: 'Active Model',       key: 'model',       type: 'text' },
  plan:        { label: 'Plan',              key: 'plan',        type: 'text' },
};

let cached = null;

function load() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    cached = { ...DEFAULTS, ...JSON.parse(raw) };
    cached.menubar = { ...DEFAULTS.menubar, ...cached.menubar };
  } catch {
    cached = structuredClone(DEFAULTS);
  }
  return cached;
}

function save(settings) {
  cached = settings;
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function get() {
  return load();
}

function update(partial) {
  const current = load();
  const merged = { ...current, ...partial };
  if (partial.menubar) {
    merged.menubar = { ...current.menubar, ...partial.menubar };
  }
  if (partial.notifications) {
    merged.notifications = { ...current.notifications, ...partial.notifications };
  }
  save(merged);
  return merged;
}

module.exports = { get, update, MENUBAR_ITEMS, DEFAULTS };
