const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');

const QVAPAY_CONFIG = {
  appId: '1c08aef4-b7e7-4266-936b-c88573e517af',
  appSecret: '8I2C4cfbOeGy96T4Vm7JVpBOdcTRA6dIJfAu21de1QmCpLnD1I',
  baseUrl: 'https://qvapay.com/api/v1',
  callbackUrl: 'https://taekwondo-refereeing.onrender.com/callback'
};

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  next();
};

// Función para consultas a la base de datos
const dbQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

// Ruta para crear pagos
router.post('/create-qvapay', authenticateToken, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    
    // Validación de entrada
    if (!userId || !plan) {
      return res.status(400).json({ error: 'Se requieren userId y plan' });
    }

    const amount = plan === 'annual' ? 100.00 : 10.00;
    const description = `Suscripción ${plan === 'annual' ? 'Anual' : 'Mensual'} - Arbitraje Taekwondo`;

    // Crear factura en QvaPay
    const response = await axios.post(`${QVAPAY_CONFIG.baseUrl}/create_invoice`, {
      app_id: QVAPAY_CONFIG.appId,
      app_secret: QVAPAY_CONFIG.appSecret,
      amount,
      description,
      remote_id: userId.toString(),
      signed: 0
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Validar respuesta
    if (!response.data?.transation_uuid) {
      throw new Error('Falta transation_uuid en la respuesta de QvaPay');
    }

    // Calcular fecha de expiración
    const expirationDate = plan === 'annual' ? 
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Guardar en base de datos
    await dbQuery(
      `INSERT INTO payments (user_id, amount, plan_type, qvapay_id, expiration_date, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, amount, plan, response.data.transation_uuid, expirationDate]
    );

    // Respuesta exitosa
    res.json({
      success: true,
      paymentUrl: response.data.url,
      qvapayId: response.data.transation_uuid,
      amount,
      description,
      expiresAt: expirationDate.toISOString()
    });

  } catch (error) {
    // Manejo de errores - aquí 'error' está definido correctamente
    console.error('Error en /create-qvapay:', {
      message: error.message,
      stack: error.stack,
      responseData: error.response?.data,
      responseStatus: error.response?.status
    });

    const statusCode = error.response?.status || 500;
    
    res.status(statusCode).json({ 
      success: false,
      error: error.message || 'Error al procesar el pago',
      details: error.response?.data || null
    });
  }
});

module.exports = router;
