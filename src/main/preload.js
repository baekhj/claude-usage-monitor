const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),
  getMenubarItems: () => ipcRenderer.invoke('get-menubar-items'),
  getSubscriptionInfo: () => ipcRenderer.invoke('get-subscription-info'),
  refreshApiUsage: () => ipcRenderer.invoke('refresh-api-usage'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  onStatsUpdate: (callback) => {
    ipcRenderer.on('stats-update', (event, data) => callback(data));
  },
});
