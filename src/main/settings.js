const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  menubar: {
    items: ['icon5h', 'icon7d', 'usagePct', 'remaining', 'costToday'],
    separator: ' · ',
    pillColors: { plan: 'none', '5h': 'none', '7d': 'none' },
  },
  apiRefreshSeconds: 300,
  notifications: {
    enabled: true,
    thresholds: [50, 75, 90],
    weeklyThresholds: [75, 90],
  },
  launchAtLogin: false,
};

const PILL_COLORS = {
  none:    { dark: null, light: null, swatch: 'transparent' },
  default: { dark: 'rgba(255,255,255,0.14)', light: 'rgba(0,0,0,0.08)',  swatch: '#888' },
  green:   { dark: 'rgba(110,231,183,0.30)', light: 'rgba(16,185,129,0.20)', swatch: '#6ee7b7' },
  blue:    { dark: 'rgba(96,165,250,0.30)',  light: 'rgba(59,130,246,0.20)', swatch: '#60a5fa' },
  purple:  { dark: 'rgba(192,132,252,0.30)', light: 'rgba(139,92,246,0.20)', swatch: '#c084fc' },
  amber:   { dark: 'rgba(251,191,36,0.30)',  light: 'rgba(217,119,6,0.20)',  swatch: '#fbbf24' },
  red:     { dark: 'rgba(248,113,113,0.30)', light: 'rgba(239,68,68,0.20)',  swatch: '#f87171' },
};

const MENUBAR_ITEMS = {
  icon5h:      { label: 'Pie Icon',           key: 'icon5h',      type: 'icon', group: '5h' },
  icon7d:      { label: 'Pie Icon',           key: 'icon7d',      type: 'icon', group: '7d' },
  usagePct:    { label: 'Usage %',            key: 'usagePct',    type: 'text', group: '5h' },
  remainPct:   { label: 'Remaining %',        key: 'remainPct',   type: 'text', group: '5h' },
  weeklyPct:   { label: 'Usage %',            key: 'weeklyPct',   type: 'text', group: '7d' },
  tokens:      { label: 'Block Tokens',       key: 'tokens',      type: 'text', group: null },
  costBlock:   { label: 'Block Cost',         key: 'costBlock',   type: 'text', group: null },
  costToday:   { label: 'Today Cost',         key: 'costToday',   type: 'text', group: null },
  remaining:   { label: 'Reset In',           key: 'remaining',   type: 'text', group: '5h' },
  weeklyReset: { label: 'Reset In',           key: 'weeklyReset', type: 'text', group: '7d' },
  requests:    { label: 'Block Requests',     key: 'requests',    type: 'text', group: null },
  reqToday:    { label: 'Today Requests',     key: 'reqToday',    type: 'text', group: null },
  model:       { label: 'Active Model',       key: 'model',       type: 'text', group: null },
  plan:        { label: 'Plan',              key: 'plan',        type: 'text', group: null },
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

module.exports = { get, update, MENUBAR_ITEMS, DEFAULTS, PILL_COLORS };
