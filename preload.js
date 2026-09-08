const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  loadDB: () => ipcRenderer.invoke('db-load'),
  saveDB: (data) => ipcRenderer.invoke('db-save', data),
  storagePath: () => ipcRenderer.invoke('storage-path'),
  documentsPath: () => ipcRenderer.invoke('documents-path'),
  saveFile: (payload) => ipcRenderer.invoke('file-save', payload),
  getFile: (id) => ipcRenderer.invoke('file-get', id),
  deleteFile: (id) => ipcRenderer.invoke('file-delete', id),
  createFullBackup: () => ipcRenderer.invoke('backup-create'),
  restoreFullBackup: () => ipcRenderer.invoke('backup-restore')
});
