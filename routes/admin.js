const express = require('express');
const router = express.Router();
const { db, runQuery } = require('../db');
const { authenticateToken } = require('../routes/auth');

// Middleware isAdmin actualizado
function isAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ 
      error: 'Se requieren privilegios de administrador',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
}

// Obtener usuarios pendientes de activación
// En tu ruta /api/admin/pending-users (backend)
router.get('/pending-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await runQuery(`
      SELECT id, email, paymentDate, paymentVerified
      FROM users 
      WHERE paymentVerified = 1 AND isActive = 0
    `);
    console.log('Usuarios pendientes:', users); // 👈 Verifica esto
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Activar usuario manualmente
// Obtener usuarios pendientes (asegúrate que solo traiga los correctos)
router.get('/pending-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await runQuery(
      `SELECT id, email, paymentDate 
       FROM users 
       WHERE paymentVerified = 1 AND isActive = 0
       AND paymentDate IS NOT NULL`
    );
    
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios pendientes' });
    }
    
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios pendientes:', error);
    res.status(500).json({ 
      error: 'Error del servidor',
      details: error.message 
    });
  }
});
// Activar usuario
router.post('/activate-user', authenticateToken, isAdmin, async (req, res) => {
  const { userId, months } = req.body;
  
  if (!userId || !months) {
    return res.status(400).json({ error: 'Se requieren userId y months' });
  }

  try {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + parseInt(months));
    
    const result = await runQuery(
      `UPDATE users SET 
       isActive = 1,
       subscriptionEnd = ?
       WHERE id = ? AND paymentVerified = 1`,
      [expirationDate.toISOString(), userId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado o pago no verificado' 
      });
    }
    
    res.json({ 
      success: true, 
      expirationDate: expirationDate.toLocaleDateString() 
    });
    
  } catch (error) {
    console.error('Error al activar usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener todos los pagos
router.get('/payments', isAdmin, async (req, res) => {
  try {
    const payments = await runQuery(
      `SELECT p.*, u.email 
       FROM payments p
       JOIN users u ON p.userId = u.id
       ORDER BY p.createdAt DESC`
    );
    res.json(payments);
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;