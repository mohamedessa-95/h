const fs=require("fs"), path=require("path");
const os=require("os");
const base=path.join(os.homedir(),"AppData","Roaming");
console.log("Unified SQLite storage module installed.");
console.log("The app should call unified-storage.initDatabase(app) during Electron startup.");
