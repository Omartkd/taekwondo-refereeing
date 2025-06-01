const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

// Función para ejecutar queries con promesas
// En db.js
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    // Determinar si es SELECT (devuelve datos) u otra consulta
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    } else {
      db.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve(this); // Devuelve el objeto result con lastID y changes
      });
    }
  });
}

// Función para activar usuario y registrar pago
async function activateUserAndRecordPayment(remote_id, amount, transaction_uuid) {
  try {
    // Calcular fecha de expiración
    const expirationDate = new Date();
    if (amount === 100) {
      expirationDate.setFullYear(expirationDate.getFullYear() + 1); // Anual
    } else {
      expirationDate.setMonth(expirationDate.getMonth() + 1); // Mensual
    }

    // Activar usuario
    await runQuery(
      `UPDATE users SET 
        isActive = 1,
        paymentDate = datetime('now'),
        subscriptionEnd = ?
       WHERE id = ?`,
      [expirationDate.toISOString(), remote_id]
    );

    // Registrar el pago
    await runQuery(
      `INSERT INTO payments (
        userId, amount, plan, status, 
        transactionId, paymentDate, expirationDate
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        remote_id,
        amount,
        amount === 100 ? 'annual' : 'monthly',
        'completed',
        transaction_uuid,
        expirationDate.toISOString()
      ]
    );

    return true;
  } catch (error) {
    console.error('Error en activateUserAndRecordPayment:', error);
    throw error;
  }
}

// Inicialización de la base de datos
async function initializeDatabase() {
  try {
    // Tabla users
    await runQuery(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      isActive INTEGER DEFAULT 0,
      isAdmin INTEGER DEFAULT 0,
      paymentVerified INTEGER DEFAULT 0,
      paymentDate TEXT,
      subscriptionEnd TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabla payments
    await runQuery(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount REAL NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      transactionId TEXT UNIQUE NOT NULL,
      paymentDate TEXT,
      expirationDate TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    // Tabla game_sessions
    await runQuery(`CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      blueScore INTEGER DEFAULT 0,
      redScore INTEGER DEFAULT 0,
      blueKamgeon INTEGER DEFAULT 0,
      redKamgeon INTEGER DEFAULT 0,
      gameActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    console.log('Tablas creadas correctamente');
  } catch (err) {
    console.error('Error en initializeDatabase:', err);
    throw err;
  }
}

module.exports = {
  db,
  runQuery,
  initializeDatabase,
  activateUserAndRecordPayment
};