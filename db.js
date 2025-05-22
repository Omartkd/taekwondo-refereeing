// db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Función de inicialización
const initializeDatabase = () => {
  db.serialize(() => {
    
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      isActive INTEGER DEFAULT 0,
      paymentDate TEXT,
      subscriptionEnd TEXT,
      ipAddress TEXT,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Crear tabla de sesiones de juego
    db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      blueScore INTEGER DEFAULT 0,
      redScore INTEGER DEFAULT 0,
      blueKamgeon INTEGER DEFAULT 0,
      redKamgeon INTEGER DEFAULT 0,
      gameActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount REAL NOT NULL,
      plan TEXT NOT NULL,
      paymentMethod TEXT DEFAULT 'qvapay',
      status TEXT NOT NULL,
      transactionId TEXT UNIQUE NOT NULL,
      paymentDate TEXT,
      expirationDate TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (userId) REFERENCES users(id)
    )`);// Todas tus CREATE TABLE y inicializaciones aquí
  });
};

module.exports = {
  db,
  initializeDatabase
};