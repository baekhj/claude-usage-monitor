const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  menubar: {
    items: ['usagePct', 'remaining', 'costToday'],
    separator: ' · ',
  },
  apiRefreshSeconds: 300,
  notifications: {
    enabled: true,
    thresholds: [50, 75, 90], // notify at these 5h usage %
    weeklyThresholds: [75, 90],
  },
  launchAtLogin: false,
};

const MENUBAR_ITEMS = {
  usagePct:    { label: '5h Usage %',         key: 'usagePct' },
  remainPct:   { label: '5h Remaining %',     key: 'remainPct' },
  weeklyPct:   { label: '7d Usage %',         key: 'weeklyPct' },
  tokens:      { label: 'Block Tokens',       key: 'tokens' },
  costBlock:   { label: 'Block Cost',         key: 'costBlock' },
  costToday:   { label: 'Today Cost',         key: 'costToday' },
  remaining:   { label: 'Block Remaining',    key: 'remaining' },
  requests:    { label: 'Block Requests',     key: 'requests' },
  reqToday:    { label: 'Today Requests',     key: 'reqToday' },
  model:       { label: 'Active Model',       key: 'model' },
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
