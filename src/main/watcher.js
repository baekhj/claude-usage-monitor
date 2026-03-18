const fs = require('fs');
const path = require('path');
const { resolveJsonlDirs, findJsonlFiles } = require('./parser');

/**
 * Watch JSONL directories for changes and trigger callback
 */
class JsonlWatcher {
  constructor(onChange) {
    this.onChange = onChange;
    this.watchers = [];
    this.debounceTimer = null;
    this.debounceMs = 1000; // 1 second debounce
  }

  start() {
    const baseDirs = resolveJsonlDirs();

    // Watch each project directory for new/modified .jsonl files
    for (const baseDir of baseDirs) {
      this._watchRecursive(baseDir);
    }
  }

  _watchRecursive(dir) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          this._scheduleUpdate();
        }
      });

      watcher.on('error', (err) => {
        // Directory may have been deleted, ignore
      });

      this.watchers.push(watcher);
    } catch {
      // Directory doesn't exist or can't be watched
    }
  }

  _scheduleUpdate() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onChange();
    }, this.debounceMs);
  }

  stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

module.exports = { JsonlWatcher };
