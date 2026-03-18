const fs = require('fs');
const path = require('path');
const os = require('os');
const { JSONL_PATHS, BLOCK_MS, USAGE_RECORD_TYPE } = require('../shared/constants');
const { calculateCost, extractProjectName, startOfDay, startOfWeek } = require('../shared/utils');

/**
 * Resolve ~ to home directory and find all project directories
 */
function resolveJsonlDirs() {
  const home = os.homedir();
  const dirs = [];

  for (const p of JSONL_PATHS) {
    const resolved = p.replace('~', home);
    if (fs.existsSync(resolved)) {
      dirs.push(resolved);
    }
  }
  return dirs;
}

/**
 * Find all .jsonl files recursively under given directories
 */
function findJsonlFiles(baseDirs) {
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  for (const baseDir of baseDirs) {
    walk(baseDir);
  }
  return files;
}

/**
 * Parse a single JSONL file and extract usage records
 */
function parseJsonlFile(filePath) {
  const records = [];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return records;
  }

  // Resolve project from file path
  // Regular: .../projects/<project-dir>/<session>.jsonl
  // Subagent: .../projects/<project-dir>/<session>/subagents/<agent>.jsonl
  const parentDir = path.basename(path.dirname(filePath));
  const isSubagent = parentDir === 'subagents';
  const projectDirName = isSubagent
    ? path.basename(path.dirname(path.dirname(path.dirname(filePath))))
    : parentDir;
  const project = extractProjectName(projectDirName);

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.type !== USAGE_RECORD_TYPE) continue;

      const usage = record.message?.usage;
      if (!usage) continue;

      const model = record.message?.model || 'unknown';
      const timestamp = record.timestamp;
      if (!timestamp) continue;

      records.push({
        timestamp: new Date(timestamp),
        model,
        project,
        sessionId: record.sessionId || null,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        costUSD: calculateCost(usage, model),
      });
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}

/**
 * Load all usage records from all JSONL files
 */
function loadAllRecords() {
  const baseDirs = resolveJsonlDirs();
  const files = findJsonlFiles(baseDirs);
  let allRecords = [];

  for (const file of files) {
    const records = parseJsonlFile(file);
    allRecords = allRecords.concat(records);
  }

  // Sort by timestamp ascending
  allRecords.sort((a, b) => a.timestamp - b.timestamp);
  return allRecords;
}

/**
 * Aggregate stats from a list of records
 */
function aggregateRecords(recs) {
  const totalInput = recs.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutput = recs.reduce((s, r) => s + r.outputTokens, 0);
  const totalCacheCreate = recs.reduce((s, r) => s + r.cacheCreationTokens, 0);
  const totalCacheRead = recs.reduce((s, r) => s + r.cacheReadTokens, 0);
  const totalCost = recs.reduce((s, r) => s + r.costUSD, 0);
  return {
    totalInput,
    totalOutput,
    totalCacheCreate,
    totalCacheRead,
    totalTokens: totalInput + totalOutput + totalCacheCreate,
    totalCost,
    requestCount: recs.length,
  };
}

/**
 * Break records into per-model aggregates
 */
function byModelAggregate(recs) {
  const groups = {};
  for (const r of recs) {
    if (!groups[r.model]) groups[r.model] = [];
    groups[r.model].push(r);
  }
  const result = {};
  for (const [model, modelRecs] of Object.entries(groups)) {
    result[model] = aggregateRecords(modelRecs);
  }
  return result;
}

/**
 * Get current 5-hour sliding window stats
 */
function getCurrentBlock(records) {
  const now = Date.now();
  const blockRecords = records.filter(
    (r) => now - r.timestamp.getTime() < BLOCK_MS
  );

  const agg = aggregateRecords(blockRecords);

  // Block start = oldest record in window (or now if none)
  const blockStart =
    blockRecords.length > 0 ? blockRecords[0].timestamp.getTime() : now;
  const blockEnd = blockStart + BLOCK_MS;
  const remainingMs = Math.max(0, blockEnd - now);

  // Last used model
  const lastModel = blockRecords.length > 0
    ? blockRecords[blockRecords.length - 1].model
    : null;

  return {
    ...agg,
    byModel: byModelAggregate(blockRecords),
    lastModel,
    blockStart: new Date(blockStart),
    blockEnd: new Date(blockEnd),
    remainingMs,
  };
}

/**
 * Get today's usage stats
 */
function getTodayStats(records) {
  const dayStart = startOfDay();
  const todayRecords = records.filter((r) => r.timestamp >= dayStart);

  return {
    ...aggregateRecords(todayRecords),
    byModel: byModelAggregate(todayRecords),
  };
}

/**
 * Get daily breakdown for the past 7 days
 */
function getWeeklyBreakdown(records) {
  const days = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayRecords = records.filter(
      (r) => r.timestamp >= dayStart && r.timestamp < dayEnd
    );

    days.push({
      date: dayStart,
      label: dayStart.toLocaleDateString('ko-KR', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      totalInput: dayRecords.reduce((s, r) => s + r.inputTokens, 0),
      totalOutput: dayRecords.reduce((s, r) => s + r.outputTokens, 0),
      totalCost: dayRecords.reduce((s, r) => s + r.costUSD, 0),
      requestCount: dayRecords.length,
    });
  }
  return days;
}

/**
 * Get breakdown by model
 */
function getModelBreakdown(records) {
  const models = {};
  for (const r of records) {
    if (!models[r.model]) {
      models[r.model] = { totalInput: 0, totalOutput: 0, totalCost: 0, requestCount: 0 };
    }
    models[r.model].totalInput += r.inputTokens;
    models[r.model].totalOutput += r.outputTokens;
    models[r.model].totalCost += r.costUSD;
    models[r.model].requestCount += 1;
  }
  return models;
}

/**
 * Get breakdown by project
 */
function getProjectBreakdown(records) {
  const projects = {};
  for (const r of records) {
    if (!projects[r.project]) {
      projects[r.project] = { totalInput: 0, totalOutput: 0, totalCost: 0, requestCount: 0 };
    }
    projects[r.project].totalInput += r.inputTokens;
    projects[r.project].totalOutput += r.outputTokens;
    projects[r.project].totalCost += r.costUSD;
    projects[r.project].requestCount += 1;
  }
  return projects;
}

/**
 * Get full aggregated stats
 */
function getStats() {
  const records = loadAllRecords();
  const block = getCurrentBlock(records);
  const today = getTodayStats(records);
  const weekly = getWeeklyBreakdown(records);
  const byModel = getModelBreakdown(records);
  const byProject = getProjectBreakdown(records);

  return {
    block,
    today,
    weekly,
    byModel,
    byProject,
    totalRecords: records.length,
  };
}

module.exports = {
  resolveJsonlDirs,
  findJsonlFiles,
  parseJsonlFile,
  loadAllRecords,
  getCurrentBlock,
  getTodayStats,
  getWeeklyBreakdown,
  getModelBreakdown,
  getProjectBreakdown,
  getStats,
};
