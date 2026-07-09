// SQLite OPFS SAH Pool worker
// Follows OPFS_implementation.md pattern exactly.
// Uses @sqlite.org/sqlite-wasm + installOpfsSAHPoolVfs for persistent local storage on static Vercel.
// All DB ops via postMessage. No direct main thread access to wasm.
// Directory: 'gymtrack-dbs' under OPFS.

let db: any = null;
let sqlite3: any = null;
let pool: any = null;

const DB_NAME = '/main.db';
const VFS_DIR = 'gymtrack-dbs';

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  try {
    let result: any;
    switch (type) {
      case 'init': {
        // baseUrl points to public/sqlite/ (copied assets for static serve)
        const baseUrl = payload.baseUrl;
        // Bypass Vite public/ import rule completely:
        // Construct `import()` at runtime with new Function so the source never contains
        // `import( ... /sqlite/index.mjs )`. Vite's transform middleware won't try to load it.
        // Runtime browser/worker `import('/sqlite/index.mjs')` will just fetch the static file.
        const m = await new Function('u', 'return import(u)')(baseUrl + 'index.mjs');
        sqlite3 = await m.default({
          locateFile: (file: string) => baseUrl + file,
          // OPFS enabled
        });
        pool = await sqlite3.installOpfsSAHPoolVfs({
          initialCapacity: 6, // small for gym db
          clearOnInit: false,
          directory: VFS_DIR,
        });
        // open or create main db
        db = new pool.OpfsSAHPoolDb(DB_NAME, 'c');
        result = { success: true, vfsName: pool.vfsName };
        break;
      }
      case 'exec': {
        if (!db) throw new Error('DB not initialized');
        const opts: any = {};
        if (payload.rowMode) opts.rowMode = payload.rowMode;
        if (payload.bind) opts.bind = payload.bind;
        const rows = db.exec(payload.sql, opts);
        const changes = sqlite3.capi.sqlite3_changes(db.pointer);
        const lastInsertRowId = sqlite3.capi.sqlite3_last_insert_rowid(db.pointer);
        result = { rows, changes, lastInsertRowId };
        break;
      }
      case 'execMany': {
        // for batch like schema or seed
        if (!db) throw new Error('DB not initialized');
        for (const sql of payload.sqls) {
          db.exec(sql);
        }
        result = { success: true };
        break;
      }
      case 'close': {
        if (db) {
          try { db.close(); } catch (_) {}
          db = null;
        }
        result = null;
        break;
      }
      case 'getFileName': {
        result = DB_NAME;
        break;
      }
      default:
        throw new Error('Unknown message type: ' + type);
    }
    self.postMessage({ id, result });
  } catch (err: any) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
