const { parentPort } = require('worker_threads');
const { getStats } = require('./parser');

parentPort.on('message', (msg) => {
  if (msg === 'getStats') {
    try {
      const stats = getStats();
      parentPort.postMessage({ ok: true, stats });
    } catch (e) {
      parentPort.postMessage({ ok: false, error: e.message });
    }
  }
});
