const jwt = require('jsonwebtoken');
const { runQuery } = require('../db');

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'secreto-desarrollo', (err, decoded) => {
    if (err) return res.sendStatus(403);
    
    // Asegúrate de asignar decoded a req.user
    req.user = decoded; // Esto es crucial
    next();
  });
}

module.exports = { authenticateToken };