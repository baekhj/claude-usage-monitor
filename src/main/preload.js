const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),
  getMenubarItems: () => ipcRenderer.invoke('get-menubar-items'),
  getPillColors: () => ipcRenderer.invoke('get-pill-colors'),
  getSubscriptionInfo: () => ipcRenderer.invoke('get-subscription-info'),
  refreshApiUsage: () => ipcRenderer.invoke('refresh-api-usage'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  onStatsUpdate: (callback) => {
    ipcRenderer.on('stats-update', (event, data) => callback(data));
  },
  // Update APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (filePath) => ipcRenderer.invoke('install-update', filePath),
  openReleasePage: () => ipcRenderer.invoke('open-release-page'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, data) => callback(data));
  },
  onUpdateState: (callback) => {
    ipcRenderer.on('update-state', (event, data) => callback(data));
  },
});
