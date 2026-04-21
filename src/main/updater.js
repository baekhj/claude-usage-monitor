const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, Notification, shell } = require('electron');
const { execFile, spawn } = require('child_process');

const REPO = 'baekhj/claude-usage-monitor';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lastNotifiedVersion = null;
let updateInfo = null;

function getCurrentVersion() {
  return app.getVersion();
}

// Persistent update cache dir (not /var/folders/.../T/ which macOS auto-cleans).
function getUpdateCacheDir() {
  return path.join(app.getPath('userData'), 'updates');
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, {
        headers: { 'User-Agent': 'claude-usage-monitor', Accept: 'application/vnd.github.v3+json' },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('Timeout')); });
    };
    get(url);
  });
}

function compareVersions(current, latest) {
  const c = current.replace(/^v/, '').split('.').map(Number);
  const l = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function getMatchingAsset(assets) {
  const arch = process.arch;
  // Prefer zip for programmatic extraction
  const zips = assets.filter(a => a.name.toLowerCase().endsWith('.zip'));
  for (const a of zips) {
    const n = a.name.toLowerCase();
    if (arch === 'arm64' && n.includes('arm64')) return a;
    if (arch === 'x64' && !n.includes('arm64')) return a;
  }
  // Fallback: any zip
  if (zips.length) return zips[0];
  // Fallback: dmg
  const dmgs = assets.filter(a => a.name.toLowerCase().endsWith('.dmg'));
  for (const a of dmgs) {
    const n = a.name.toLowerCase();
    if (arch === 'arm64' && n.includes('arm64')) return a;
    if (arch === 'x64' && !n.includes('arm64')) return a;
  }
  return dmgs[0] || null;
}

function getAppBundlePath() {
  const exePath = app.getPath('exe');
  let current = exePath;
  while (current !== '/' && current !== '.') {
    if (current.endsWith('.app')) return current;
    current = path.dirname(current);
  }
  return null;
}

async function checkForUpdates() {
  try {
    const release = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!release) return { available: false, current: getCurrentVersion() };

    const latestVersion = release.tag_name;
    const currentVersion = getCurrentVersion();
    const available = compareVersions(currentVersion, latestVersion);

    updateInfo = {
      available,
      current: currentVersion,
      latest: latestVersion,
      assets: release.assets || [],
      releaseUrl: release.html_url,
      releaseNotes: release.body || '',
    };

    if (available && lastNotifiedVersion !== latestVersion) {
      lastNotifiedVersion = latestVersion;
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: `Update Available: ${latestVersion}`,
          body: `Current: v${currentVersion}. Click to open app.`,
          silent: false,
        });
        notif.show();
      }
    }

    return updateInfo;
  } catch (e) {
    return { available: false, current: getCurrentVersion(), error: e.message };
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'claude-usage-monitor' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));

        const total = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(dest);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress({ percent: total ? Math.round(downloaded / total * 100) : 0, downloaded, total });
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(dest); });
        file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        res.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', reject);
    };
    get(url);
  });
}

async function downloadUpdate(onProgress) {
  if (!updateInfo?.available) throw new Error('No update available');

  const asset = getMatchingAsset(updateInfo.assets);
  if (!asset) throw new Error(`No matching asset for ${process.arch}`);

  const cacheDir = getUpdateCacheDir();
  if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const filePath = path.join(cacheDir, asset.name);
  await downloadFile(asset.browser_download_url, filePath, onProgress);

  return { filePath, tmpDir: cacheDir, isDmg: asset.name.toLowerCase().endsWith('.dmg') };
}

async function installUpdate(filePath) {
  // File may have been wiped (OS tmp cleaner, reboot, user cleanup). Fail fast with a clear, actionable error.
  if (!filePath || !fs.existsSync(filePath)) {
    const err = new Error('Downloaded file is missing — please click Download again.');
    err.code = 'UPDATE_FILE_MISSING';
    throw err;
  }

  const isDmg = filePath.toLowerCase().endsWith('.dmg');
  const tmpDir = path.dirname(filePath);

  if (isDmg) {
    // Just open the DMG and let the user drag-install
    shell.openPath(filePath);
    return { method: 'dmg' };
  }

  // ZIP: extract and replace
  const extractDir = path.join(tmpDir, 'extracted');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });

  await new Promise((resolve, reject) => {
    execFile('ditto', ['-xk', filePath, extractDir], (err) => {
      if (err) reject(new Error('Extract failed: ' + err.message)); else resolve();
    });
  });

  const entries = fs.readdirSync(extractDir);
  const appName = entries.find(f => f.endsWith('.app'));
  if (!appName) throw new Error('No .app found in archive');

  const newAppPath = path.join(extractDir, appName);
  const currentAppPath = getAppBundlePath();

  if (!currentAppPath) {
    // Dev mode: just open the extracted folder
    shell.showItemInFolder(newAppPath);
    return { method: 'manual' };
  }

  // Spawn a detached script: wait for quit → replace → relaunch
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`,
    `rm -rf "${currentAppPath}"`,
    `cp -R "${newAppPath}" "${currentAppPath}"`,
    `open "${currentAppPath}"`,
    `rm -rf "${tmpDir}"`,
  ].join('\n');

  const child = spawn('bash', ['-c', script], { detached: true, stdio: 'ignore' });
  child.unref();

  app.quit();
  return { method: 'auto' };
}

function openReleasePage() {
  if (updateInfo?.releaseUrl) shell.openExternal(updateInfo.releaseUrl);
}

function startUpdateChecker() {
  setTimeout(checkForUpdates, 30 * 1000);
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

module.exports = { checkForUpdates, downloadUpdate, installUpdate, openReleasePage, startUpdateChecker, getAppBundlePath };
