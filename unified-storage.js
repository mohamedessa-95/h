// Unified local storage + full backup/restore helpers for the law-office app.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let Database;
try { Database = require("better-sqlite3"); } catch (_) { Database = null; }

function getStorageRoot(app) {
  return path.join(app.getPath("userData"), "office-data");
}
function ensureStorage(app) {
  const root = getStorageRoot(app);
  for (const p of [root, path.join(root,"documents"), path.join(root,"backups")]) {
    fs.mkdirSync(p, { recursive: true });
  }
  return root;
}
function dbPath(app) { return path.join(ensureStorage(app), "office.sqlite"); }

function initDatabase(app) {
  if (!Database) throw new Error("better-sqlite3 is required for the unified SQLite storage.");
  const db = new Database(dbPath(app));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, role TEXT, data_json TEXT);
    CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cases(id INTEGER PRIMARY KEY, client_id INTEGER, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY, case_id INTEGER, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS powers_of_attorney(id INTEGER PRIMARY KEY, client_id INTEGER, case_id INTEGER, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, case_id INTEGER, client_id INTEGER, original_name TEXT NOT NULL, relative_path TEXT UNIQUE NOT NULL, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, created_at TEXT, data_json TEXT);
    CREATE TABLE IF NOT EXISTS financial_transactions(id INTEGER PRIMARY KEY, case_id INTEGER, client_id INTEGER, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
  `);
  db.prepare("INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)").run("storage_engine","sqlite");
  db.prepare("INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)").run("storage_version","2");
  return db;
}

function sha256File(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

module.exports = { getStorageRoot, ensureStorage, dbPath, initDatabase, sha256File };
