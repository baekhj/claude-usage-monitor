const https = require('https');
const { app, Notification, shell } = require('electron');

const REPO = 'baekhj/claude-usage-monitor';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour
let lastNotifiedVersion = null;

function getCurrentVersion() {
  return app.getVersion();
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'claude-usage-monitor',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Invalid JSON')); }
        } else if (res.statusCode === 404) {
          resolve(null); // no releases yet
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
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

async function checkForUpdates() {
  try {
    const release = await fetchLatestRelease();
    if (!release) return null;

    const latestVersion = release.tag_name;
    const currentVersion = getCurrentVersion();

    if (compareVersions(currentVersion, latestVersion) && lastNotifiedVersion !== latestVersion) {
      lastNotifiedVersion = latestVersion;

      if (Notification.isSupported()) {
        const notif = new Notification({
          title: `Update Available: ${latestVersion}`,
          body: `Current: v${currentVersion}. Click to download.`,
          silent: false,
        });
        notif.on('click', () => {
          shell.openExternal(release.html_url);
        });
        notif.show();
      }

      return { available: true, current: currentVersion, latest: latestVersion, url: release.html_url };
    }

    return { available: false, current: currentVersion, latest: latestVersion };
  } catch {
    return null;
  }
}

function startUpdateChecker() {
  // Check after 30s, then every hour
  setTimeout(checkForUpdates, 30 * 1000);
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

module.exports = { checkForUpdates, startUpdateChecker };
