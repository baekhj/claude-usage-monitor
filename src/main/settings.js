const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  menubar: {
    items: ['icon5h', 'icon7d', 'usagePct', 'remaining', 'costToday'],
    separator: ' · ',
    pillColors: { plan: 'none', '5h': 'none', '7d': 'none' },
    dynamicColors: true,
  },
  apiRefreshSeconds: 300,
  notifications: {
    enabled: true,
    thresholds: [50, 75, 90],
    weeklyThresholds: [75, 90],
  },
  launchAtLogin: false,
  theme: 'dark',
};

const PILL_COLORS = {
  none:    { bg: null, text: null, swatch: 'transparent' },
  default: { bg: '#5a5a5a', text: '#fff', swatch: '#888' },
  green:   { bg: '#1a7a52', text: '#fff', swatch: '#6ee7b7' },
  blue:    { bg: '#2c6fcc', text: '#fff', swatch: '#60a5fa' },
  purple:  { bg: '#7048b8', text: '#fff', swatch: '#c084fc' },
  amber:   { bg: '#a07610', text: '#fff', swatch: '#fbbf24' },
  red:     { bg: '#c43a31', text: '#fff', swatch: '#f87171' },
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

// Dynamic color based on usage percentage
const DYNAMIC_COLORS = [
  { max: 50,  bg: '#1a7a52', text: '#fff' },  // green — safe
  { max: 75,  bg: '#a07610', text: '#fff' },  // amber — caution
  { max: 90,  bg: '#c46a15', text: '#fff' },  // orange — warning
  { max: 100, bg: '#c43a31', text: '#fff' },  // red — danger
];

function getDynamicColor(pct) {
  if (pct == null || pct < 0) pct = 0;
  for (const level of DYNAMIC_COLORS) {
    if (pct <= level.max) return { bg: level.bg, text: level.text };
  }
  return DYNAMIC_COLORS[DYNAMIC_COLORS.length - 1];
}

module.exports = { get, update, MENUBAR_ITEMS, DEFAULTS, PILL_COLORS, DYNAMIC_COLORS, getDynamicColor };
