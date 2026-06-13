const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'banking.db');

let db;

function getDatabase() {
  if (!db) {
    try {
      // TODO: adicionar pool de conexões para produção
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      inicializarTabelas();
    } catch (erro) {
      throw new Error(`Falha ao inicializar banco de dados: ${erro.message}`);
    }
  }
  return db;
}

function inicializarTabelas() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { getDatabase };
