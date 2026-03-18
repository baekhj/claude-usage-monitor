// 5-hour sliding window in milliseconds
const BLOCK_MS = 5 * 60 * 60 * 1000;

// Auto-refresh interval (30 seconds)
const REFRESH_INTERVAL_MS = 30 * 1000;

// JSONL file search paths
const JSONL_PATHS = [
  '~/.claude/projects',
  '~/.config/claude/projects',
];

// Model pricing (USD per token)
// https://docs.anthropic.com/en/docs/about-claude/models
const MODEL_PRICING = {
  'claude-opus-4-6': {
    input: 15 / 1_000_000,
    output: 75 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
    cacheRead: 1.5 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
    cacheWrite: 3.75 / 1_000_000,
    cacheRead: 0.3 / 1_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input: 0.8 / 1_000_000,
    output: 4 / 1_000_000,
    cacheWrite: 1 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
  },
};

// Fallback pricing for unknown models (use Sonnet pricing)
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet-4-6'];

// Record types that contain usage data
const USAGE_RECORD_TYPE = 'assistant';

module.exports = {
  BLOCK_MS,
  REFRESH_INTERVAL_MS,
  JSONL_PATHS,
  MODEL_PRICING,
  DEFAULT_PRICING,
  USAGE_RECORD_TYPE,
};
