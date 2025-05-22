const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const paymentRoutes = require('./routes/payments');

// Configuración
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-desarrollo';
const CLIENT_URL = isProduction 
  ? 'https://taekwondo-refereeing.onrender.com' 
  : 'http://localhost:3000';

const { db, initializeDatabase } = require('./db');
initializeDatabase();
    

    // Insertar usuario admin si no existe
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.get("SELECT id FROM users WHERE email = 'admin@example.com'", (err, row) => {
      if (!row) {
        db.run(`INSERT INTO users (email, password, isActive, subscriptionEnd) 
                VALUES (?, ?, 1, datetime('now', '+30 days'))`, 
                ['admin@example.com', adminPassword]);
        console.log('Usuario admin creado: admin@example.com / admin123');
      }
    });

// Middlewares
app.use(cors({
  origin: CLIENT_URL,
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/api/payments', paymentRoutes);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html'); // Configura tu motor de vistas

// Rutas de autenticación
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, 
      [email, hashedPassword], 
      function(err) {
        if (err) {
          return res.status(400).json({ error: 'El email ya está registrado' });
        }
        res.status(201).json({ message: 'Usuario registrado. Espera activación.' });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: 'Cuenta no activa. Espera activación.' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ 
      token, 
      user: { 
        email: user.email, 
        subscriptionEnd: user.subscriptionEnd 
      } 
    });
  });
});

// Middleware de autenticación
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);
    
    db.get("SELECT id, isActive FROM users WHERE id = ?", [decoded.userId], (err, user) => {
      if (err || !user || !user.isActive) return res.sendStatus(403);
      req.userId = user.id;
      next();
    });
  });
}

// Ruta para verificar token
app.get('/api/validate', authenticateToken, (req, res) => {
  res.json({ valid: true });
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

// Configuración Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000
  }
});

// Almacenamiento en memoria para sesiones activas
const activeSessions = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No autorizado'));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Autenticación fallida'));
    
    db.get("SELECT id, isActive FROM users WHERE id = ?", [decoded.userId], (err, user) => {
      if (err || !user || !user.isActive) return next(new Error('Cuenta no activa'));
      socket.userId = user.id;
      next();
    });
  });
});

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.userId);

  socket.on('syncScore', (data) => {
    // Re-emitir a todos los clientes del mismo usuario
    io.to(socket.userId.toString()).emit('updateScore', data);
  });

   socket.join(socket.userId.toString());
  
  // Cargar o crear sesión de juego
  if (!activeSessions.has(socket.userId)) {
    db.get(
      `SELECT blueScore, redScore, blueKamgeon, redKamgeon, gameActive 
       FROM game_sessions 
       WHERE userId = ? 
       ORDER BY createdAt DESC LIMIT 1`,
      [socket.userId],
      (err, row) => {
        const gameState = row || {
          blueScore: 0,
          redScore: 0,
          blueKamgeon: 0,
          redKamgeon: 0,
          gameActive: 1
        };
        
        activeSessions.set(socket.userId, {
          gameState: {
            blueScore: gameState.blueScore,
            redScore: gameState.redScore,
            gameActive: Boolean(gameState.gameActive)
          },
          kamgeonState: {
            blueScore: gameState.blueKamgeon || 0,
            redScore: gameState.redKamgeon || 0
          },
          anotacionesTemporales: {
            azul: [],
            rojo: []
          }
        });
        
        emitInitialState(socket);
      }
    );
  } else {
    emitInitialState(socket);
  }
  
  function emitInitialState(socket) {
    const session = activeSessions.get(socket.userId);
    socket.emit('gameState', session.gameState);
    socket.emit('kamgeonState', session.kamgeonState);
  }

  // Manejadores de eventos
  const handlePuntuacion = (points) => (data) => {
    const session = activeSessions.get(socket.userId);
    if (!session || !session.gameState.gameActive) return;

    const { equipo, timestamp } = data;
    const now = Date.now();

    if (now - timestamp <= 5000) {
      session.anotacionesTemporales[equipo].push({ timestamp, clienteId: socket.id });

      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      if (session.anotacionesTemporales[equipo].length >= 2) {
        const anotaciones = session.anotacionesTemporales[equipo];
        const primeraAnotacion = anotaciones[0];
        const ultimaAnotacion = anotaciones[anotaciones.length - 1];

        if (primeraAnotacion.clienteId !== ultimaAnotacion.clienteId) {
          const diferencia = Math.abs(primeraAnotacion.timestamp - ultimaAnotacion.timestamp);

          if (diferencia <= 5000) {
            if (equipo === 'azul') {
              session.gameState.blueScore += points;
            } else {
              session.gameState.redScore += points;
            }

            io.to(socket.userId.toString()).emit('gameState', session.gameState);
            session.anotacionesTemporales[equipo] = [];
            checkScoreDifference(socket.userId);
          } else {
            session.anotacionesTemporales[equipo].shift();
          }
        } else {
          session.anotacionesTemporales[equipo].shift();
        }
      } else {
        session.timeoutId = setTimeout(() => {
          session.anotacionesTemporales[equipo] = [];
        }, 5000);
      }
    }
  };

  socket.on('puntuacionCabeza', handlePuntuacion(3));
  socket.on('puntuacionPeto', handlePuntuacion(2));
  socket.on('puntuacionGiroPeto', handlePuntuacion(4));
  socket.on('puntuacionGiroCabeza', handlePuntuacion(5));
  socket.on('puntuacionPuño', handlePuntuacion(1));

  socket.on('puntuacionRestar', (data) => {
    const session = activeSessions.get(socket.userId);
    if (!session || !session.gameState.gameActive) return;

    const { equipo } = data;
    
    if (equipo === 'azul') {
      session.gameState.blueScore = Math.max(session.gameState.blueScore - 1, 0);
    } else {
      session.gameState.redScore = Math.max(session.gameState.redScore - 1, 0);
    }

    io.to(socket.userId.toString()).emit('gameState', session.gameState);
    checkScoreDifference(socket.userId);
  });

  socket.on('puntuacionSumar', (data) => {
    const session = activeSessions.get(socket.userId);
    if (!session || !session.gameState.gameActive) return;

    const { equipo } = data;
    
    if (equipo === 'azul') {
      session.gameState.blueScore += 1;
    } else {
      session.gameState.redScore += 1;
    }

    io.to(socket.userId.toString()).emit('gameState', session.gameState);
    checkScoreDifference(socket.userId);
  });

  socket.on('puntuacionKamgeon', (data) => {
    const session = activeSessions.get(socket.userId);
    if (!session || !session.gameState.gameActive) return;

    const { equipo } = data;
    
    if (equipo === 'azul') {
      session.kamgeonState.blueScore += 1;
    } else {
      session.kamgeonState.redScore += 1;
    }

    io.to(socket.userId.toString()).emit('kamgeonState', session.kamgeonState);
  });

  socket.on('resetGame', () => {
    const session = activeSessions.get(socket.userId);
    if (!session) return;

    session.gameState = {
      blueScore: 0,
      redScore: 0,
      gameActive: true
    };
    
    session.kamgeonState = {
      blueScore: 0,
      redScore: 0
    };
    
    session.anotacionesTemporales = {
      azul: [],
      rojo: []
    };
    
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    
    // Guardar en base de datos
    db.run(
      `INSERT INTO game_sessions 
       (userId, blueScore, redScore, blueKamgeon, redKamgeon, gameActive) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        socket.userId, 
        session.gameState.blueScore, 
        session.gameState.redScore,
        session.kamgeonState.blueScore,
        session.kamgeonState.redScore,
        1
      ]
    );
    
    io.to(socket.userId.toString()).emit('gameState', session.gameState);
    io.to(socket.userId.toString()).emit('kamgeonState', session.kamgeonState);
    io.to(socket.userId.toString()).emit('gameReset');
    
    console.log(`Juego reiniciado para usuario ${socket.userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.userId);
    // Guardar estado al desconectar

    const session = activeSessions.get(socket.userId);
    if (session) {
      db.run(
        `INSERT INTO game_sessions 
         (userId, blueScore, redScore, blueKamgeon, redKamgeon, gameActive) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          socket.userId, 
          session.gameState.blueScore, 
          session.gameState.redScore,
          session.kamgeonState.blueScore,
          session.kamgeonState.redScore,
          session.gameState.gameActive ? 1 : 0
        ]
      );
    }
  });
});

function checkScoreDifference(userId) {
  const session = activeSessions.get(userId);
  if (!session || !session.gameState.gameActive) return;

  const { blueScore, redScore } = session.gameState;
  const difference = Math.abs(blueScore - redScore);
  
  if (difference >= 12) {
    session.gameState.gameActive = false;
    const winner = blueScore > redScore ? 'azul' : 'rojo';
    
    const victoryData = {
      winner: winner,
      blueScore: blueScore,
      redScore: redScore,
      difference: difference,
      timestamp: Date.now()
    };
    
    io.to(userId.toString()).emit('victoriaPorDiferencia', victoryData);
    
    // Guardar en base de datos
    db.run(
      `INSERT INTO game_sessions 
       (userId, blueScore, redScore, blueKamgeon, redKamgeon, gameActive) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        session.gameState.blueScore, 
        session.gameState.redScore,
        session.kamgeonState.blueScore,
        session.kamgeonState.redScore,
        0
      ]
    );
  }
}

// Ruta para administración (activar usuarios)
app.post('/api/admin/activate', authenticateToken, (req, res) => {
  // Verificar si el usuario es admin (deberías implementar roles)
  db.get("SELECT id FROM users WHERE id = ? AND email = 'admin@example.com'", [req.userId], (err, user) => {
    if (err || !user) return res.status(403).json({ error: 'No autorizado' });

    const { userId } = req.body;
    db.run("UPDATE users SET isActive = 1 WHERE id = ?", [userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en ${isProduction ? CLIENT_URL : `http://localhost:${PORT}`}`);
});
