const { execSync } = require('child_process');
const https = require('https');

let cachedCredentials = null;
let cachedUsageData = null;
let lastFetchTime = 0;

/**
 * Read Claude Code OAuth credentials from macOS Keychain
 */
function readKeychainCredentials() {
  if (cachedCredentials?.accessToken && cachedCredentials.expiresAt > Date.now()) {
    return cachedCredentials;
  }

  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    const data = JSON.parse(raw);
    const oauth = data.claudeAiOauth;
    if (!oauth?.accessToken) return null;

    cachedCredentials = {
      accessToken: oauth.accessToken,
      expiresAt: oauth.expiresAt,
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier,
    };
    return cachedCredentials;
  } catch {
    return null;
  }
}

/**
 * Send a minimal Messages API request and read rate-limit headers.
 * The trick: anthropic-beta: oauth-2025-04-20 enables Bearer OAuth auth,
 * and the response headers contain unified utilization data regardless
 * of whether the response is 2xx or 429.
 */
function fetchUsageViaHeaders(accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // Both 2xx and 429 carry valid rate-limit headers
        if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 429) {
          const headers = res.headers;
          const usage = {
            sessionUtilization: parseFloat(headers['anthropic-ratelimit-unified-5h-utilization'] || '0'),
            sessionReset: parseResetTime(headers['anthropic-ratelimit-unified-5h-reset']),
            weeklyUtilization: parseFloat(headers['anthropic-ratelimit-unified-7d-utilization'] || '0'),
            weeklyReset: parseResetTime(headers['anthropic-ratelimit-unified-7d-reset']),
            lastUpdated: Date.now(),
          };
          resolve(usage);
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('Token expired or invalid'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function parseResetTime(value) {
  if (!value) return null;
  const ts = parseFloat(value);
  if (!isNaN(ts)) return ts * 1000; // convert seconds to ms
  return null;
}

/**
 * Get usage data (with caching)
 * Returns { available, data, stale?, error? }
 */
async function getUsageFromAPI() {

  const creds = readKeychainCredentials();
  if (!creds) {
    return { available: false, error: 'No credentials in Keychain' };
  }

  try {
    const data = await fetchUsageViaHeaders(creds.accessToken);
    cachedUsageData = data;
    lastFetchTime = Date.now();
    return { available: true, data };
  } catch (err) {
    if (cachedUsageData) {
      return { available: true, data: cachedUsageData, stale: true };
    }
    return { available: false, error: err.message };
  }
}

/**
 * Get subscription info from keychain
 */
function getSubscriptionInfo() {
  const creds = readKeychainCredentials();
  if (!creds) return null;
  return {
    subscriptionType: creds.subscriptionType,
    rateLimitTier: creds.rateLimitTier,
    tokenValid: creds.expiresAt > Date.now(),
  };
}

module.exports = { getUsageFromAPI, getSubscriptionInfo };
