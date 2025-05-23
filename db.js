// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Configura la ruta de la base de datos
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');

// Crea la conexión
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar a SQLite:', err.message);
  } else {
    console.log('Conectado a SQLite en:', dbPath);
    // Inicializa las tablas si no existen
    initializeTables();
  }
});

// Función para inicializar tablas
function initializeTables() {
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    amount REAL NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    transactionId TEXT UNIQUE NOT NULL,
    createdAt TEXT DEFAULT (datetime('now','localtime'))
  `, (err) => {
    if (err) {
      console.error('Error creando tabla payments:', err);
    }
  });
}

// Exporta la instancia de la base de datos
module.exports = db;
