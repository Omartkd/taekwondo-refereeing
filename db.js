// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Configuración de la conexión
const db = new sqlite3.Database(
  process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite'),
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('Error al conectar a SQLite:', err.message);
    } else {
      console.log('Conexión a SQLite establecida');
    }
  }
);

// Función de inicialización
async function initializeDatabase() {
  try {
    await runQuery(`CREATE TABLE IF NOT EXISTS users (...)`);
    await runQuery(`CREATE TABLE IF NOT EXISTS payments (...)`);
    await runQuery(`CREATE TABLE IF NOT EXISTS game_sessions (...)`);
    console.log('Base de datos inicializada correctamente');
  } catch (err) {
    console.error('Error inicializando DB:', err);
  }
}

// Funciones de ayuda
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Exportar las funciones necesarias
module.exports = {
  db,
  runQuery,
  getQuery,
  initializeDatabase
};
