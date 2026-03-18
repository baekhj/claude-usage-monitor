const { MODEL_PRICING, DEFAULT_PRICING, BLOCK_MS } = require('./constants');

/**
 * Format milliseconds to "Xh Ym" string
 */
function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Format USD cost
 */
function formatCost(usd) {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

/**
 * Calculate cost for a single usage record
 */
function calculateCost(usage, model) {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  // input_tokens includes cache_read tokens in some cases, but we calculate separately
  const directInput = Math.max(0, inputTokens - cacheRead);

  return (
    directInput * pricing.input +
    outputTokens * pricing.output +
    cacheCreation * pricing.cacheWrite +
    cacheRead * pricing.cacheRead
  );
}

/**
 * Extract project name from directory path
 * e.g., "-Users-jun-work-workspace-myproject" -> "myproject"
 * e.g., "-Users-jun-work-workspace-pod-root" -> "pod-root"
 * e.g., "-Users-jun" -> "~"
 */
function extractProjectName(dirName) {
  // Pattern: -Users-<user>-...-<workspace>-<project>
  const match = dirName.match(/-Users-[^-]+-(?:work-workspace-|Library-[^-]+-[^-]+-)?(.+)/);
  if (match) return match[1];
  // Home directory session
  if (/^-Users-[^-]+$/.test(dirName)) return '~';
  return dirName;
}

/**
 * Get start of day (local timezone)
 */
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get start of week (Monday, local timezone)
 */
function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

module.exports = {
  formatDuration,
  formatTokens,
  formatCost,
  calculateCost,
  extractProjectName,
  startOfDay,
  startOfWeek,
};
