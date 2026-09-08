// Backup/Restore UI helpers. Wire these functions to your existing Settings/Backup buttons.
window.OfficeBackup = {
  async create() {
    if (window.electronAPI?.createFullBackup) return window.electronAPI.createFullBackup();
    alert("ميزة النسخ الاحتياطي الكامل تحتاج ربط IPC في نسخة Electron.");
  },
  async restore() {
    if (window.electronAPI?.restoreFullBackup) return window.electronAPI.restoreFullBackup();
    alert("ميزة الاسترجاع الكامل تحتاج ربط IPC في نسخة Electron.");
  }
};
