const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

let db;
function dataRoot(){ return path.join(app.getPath('userData'),'office-data'); }
function ensure(){ const r=dataRoot(); fs.mkdirSync(r,{recursive:true}); fs.mkdirSync(path.join(r,'documents'),{recursive:true}); fs.mkdirSync(path.join(r,'backups'),{recursive:true}); return r; }
function dbFile(){ return path.join(ensure(),'office.sqlite'); }
function initDb(){
  db=new Database(dbFile());
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, relative_path TEXT NOT NULL, original_name TEXT, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, created_at TEXT NOT NULL);`);
}
function createWindow(){
  const w=new BrowserWindow({width:1200,height:800,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  w.loadFile(path.join(__dirname,'index.html'));
}
function safeName(n){ return String(n||'file').replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,180); }

ipcMain.handle('db-load',()=>{ const row=db.prepare('SELECT data_json FROM app_state WHERE id=1').get(); return row?JSON.parse(row.data_json):null; });
ipcMain.handle('db-save',(_e,data)=>{ db.prepare('INSERT INTO app_state(id,data_json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at').run(JSON.stringify(data),new Date().toISOString()); return true; });
ipcMain.handle('storage-path',()=>ensure());
ipcMain.handle('documents-path',()=>{const p=path.join(ensure(),'documents');fs.mkdirSync(p,{recursive:true});return p;});
ipcMain.handle('file-save',async(_e,{id,name,mime,arrayBuffer})=>{
  const root=ensure(); const rel=path.join('documents',safeName(id)+'_'+safeName(name)); const abs=path.join(root,rel);
  fs.mkdirSync(path.dirname(abs),{recursive:true}); const buf=Buffer.from(arrayBuffer); fs.writeFileSync(abs,buf);
  const sha=crypto.createHash('sha256').update(buf).digest('hex');
  db.prepare('INSERT INTO files(id,relative_path,original_name,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET relative_path=excluded.relative_path,original_name=excluded.original_name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,sha256=excluded.sha256').run(id,rel,name,mime||'application/octet-stream',buf.length,sha,new Date().toISOString());
  return {id,relativePath:rel,size:buf.length,sha256:sha};
});
ipcMain.handle('file-get',(_e,id)=>{const row=db.prepare('SELECT * FROM files WHERE id=?').get(id); if(!row)return null; const abs=path.join(ensure(),row.relative_path); if(!fs.existsSync(abs))return null; return {name:row.original_name,mime:row.mime_type,arrayBuffer:fs.readFileSync(abs)};});
ipcMain.handle('file-delete',(_e,id)=>{const row=db.prepare('SELECT relative_path FROM files WHERE id=?').get(id);if(row){const abs=path.join(ensure(),row.relative_path);if(fs.existsSync(abs))fs.rmSync(abs,{force:true});db.prepare('DELETE FROM files WHERE id=?').run(id);}return true;});

async function zipFolder(source,outFile){
  return new Promise((resolve,reject)=>{const output=fs.createWriteStream(outFile);const archive=archiver('zip',{zlib:{level:9}});output.on('close',()=>resolve(outFile));archive.on('error',reject);archive.pipe(output);archive.directory(source,false);archive.finalize();});
}
ipcMain.handle('backup-create',async()=>{
  const root=ensure(); db.pragma('wal_checkpoint(TRUNCATE)');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const out=path.join(root,'backups',`مكتب-المحاماة-${stamp}.zip`);
  const stage=path.join(root,`.backup-stage-${Date.now()}`); fs.mkdirSync(stage,{recursive:true});
  fs.copyFileSync(dbFile(),path.join(stage,'office.sqlite'));
  fs.cpSync(path.join(root,'documents'),path.join(stage,'documents'),{recursive:true});
  fs.writeFileSync(path.join(stage,'files.json'),JSON.stringify(db.prepare('SELECT * FROM files').all(),null,2),'utf8');
  try { await zipFolder(stage,out); } finally { fs.rmSync(stage,{recursive:true,force:true}); }
  return out;
});
ipcMain.handle('backup-restore',async()=>{
  const pick=await dialog.showOpenDialog({title:'اختيار النسخة الاحتياطية',filters:[{name:'Backup ZIP',extensions:['zip']}],properties:['openFile']});
  if(pick.canceled||!pick.filePaths[0])return {cancelled:true};
  const selected=pick.filePaths[0]; const root=ensure(); const temp=path.join(root,'restore-temp'); if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true}); fs.mkdirSync(temp,{recursive:true});
  new AdmZip(selected).extractAllTo(temp,true);
  const restoredDb=path.join(temp,'office.sqlite'); const restoredDocs=path.join(temp,'documents');
  if(!fs.existsSync(restoredDb))throw new Error('النسخة الاحتياطية غير صالحة: قاعدة البيانات غير موجودة');
  if(db){db.close();db=null;}
  fs.copyFileSync(restoredDb,dbFile()); if(fs.existsSync(restoredDocs)){fs.rmSync(path.join(root,'documents'),{recursive:true,force:true});fs.cpSync(restoredDocs,path.join(root,'documents'),{recursive:true});}
  const restoredFiles=path.join(temp,'files.json');
  initDb();
  if(fs.existsSync(restoredFiles)){ const rows=JSON.parse(fs.readFileSync(restoredFiles,'utf8')); db.exec('DELETE FROM files'); const s=db.prepare('INSERT INTO files(id,relative_path,original_name,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?)'); const tx=db.transaction(rs=>rs.forEach(r=>s.run(r.id,r.relative_path,r.original_name,r.mime_type,r.size_bytes,r.sha256,r.created_at))); tx(rows); }
  fs.rmSync(temp,{recursive:true,force:true}); return {ok:true};
});

app.whenReady().then(()=>{ensure();initDb();createWindow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
