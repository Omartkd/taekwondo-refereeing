const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db'); // Asegúrate de tener tu configuración de DB

// Configuración QvaPay
const QVAPAY_CONFIG = {
  appId: '1c08aef4-b7e7-4266-936b-c88573e517af',
  appSecret: '8I2C4cfbOeGy96T4Vm7JVpBOdcTRA6dIJfAu21de1QmCpLnD1I',
  baseUrl: 'https://qvapay.com/api/v2',
  callbackUrl: 'https://taekwondo-refereeing.onrender.com/callback',
};

// Middleware de autenticación (simplificado)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  // Aquí iría la lógica de verificación del token
  next();
};

// Crear pago con QvaPay
router.post('/create-qvapay', authenticateToken, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    const amount = plan === 'annual' ? 100.00 : 10.00;
    const description = `Suscripción ${plan === 'annual' ? 'Anual' : 'Mensual'} - Arbitraje Taekwondo`;

    const response = await axios.post(`${QVAPAY_CONFIG.baseUrl}/create_invoice`, {
      app_id: QVAPAY_CONFIG.appId,
      app_secret: QVAPAY_CONFIG.appSecret,
      amount,
      description,
      remote_id: userId.toString(),
      signed: 0
    });

    // Guardar en DB
    db.run(
      `INSERT INTO payments (...) VALUES (?, ?, ?, ?, ?)`,
      [userId, amount, plan, response.data.uuid, plan === 'annual' ? '+12 months' : '+1 month'],
      function(err) {
        if (err) {
          console.error('Error al insertar en DB:', err);
          return res.status(500).json({ error: 'Error al guardar el pago' });
        }
        
        console.log('Pago registrado con ID:', this.lastID);
        res.json({
          paymentUrl: response.data.url,
          qvapayId: response.data.uuid
        });
      }
    );

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
