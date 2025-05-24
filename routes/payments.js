const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');

console.log('runQuery está definido?', typeof runQuery); // Debería mostrar "function"

const QVAPAY_CONFIG = {
  appId: '1c08aef4-b7e7-4266-936b-c88573e517af',
  appSecret: 'RBypDD68TBekw6QIMitIlr2juju5tnkeBqPMCoJDJ4OKX5Xz73',
  baseUrl: 'https://qvapay.com/api/v2',
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

// Ruta para crear pagos adaptada para SQLite
router.post('/create-qvapay', authenticateToken, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    
    // Validación de entrada
    if (!userId || !plan || !['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requieren userId y plan (monthly o annual)'
      });
    }

    const amount = plan === 'annual' ? 100.00 : 10.00;
    const description = `Suscripción ${plan === 'annual' ? 'Anual' : 'Mensual'} - Arbitraje Taekwondo`;

    // Lógica para crear el pago en QvaPay (tu implementación existente)
    const response = await axios.post(`${QVAPAY_CONFIG.baseUrl}/create_invoice`, {
      app_id: QVAPAY_CONFIG.appId,
      app_secret: QVAPAY_CONFIG.appSecret,
      amount,
      description,
      remote_id: userId.toString(),
      signed: 0
    });

    // Validación de respuesta
    if (!response.data?.transation_uuid) {
      throw new Error('Respuesta inválida de QvaPay');
    }

    // Calculamos fecha de expiración
    const expirationDate = new Date();
    if (plan === 'annual') {
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    } else {
      expirationDate.setMonth(expirationDate.getMonth() + 1);
    }

    // Insertamos el pago usando tu función runQuery
    const result=await runQuery(
      `INSERT INTO payments (
        userId, 
        amount, 
        plan, 
        status, 
        transactionId, 
        paymentDate, 
        expirationDate
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        userId,
        amount,
        plan,
        'pending', // status
        response.data.transation_uuid, // transactionId
        expirationDate.toISOString() // expirationDate
      ]
    );

    // Actualizamos la suscripción del usuario si es necesario
    await runQuery(
      `UPDATE users SET 
        isActive = 1,
        paymentDate = datetime('now'),
        subscriptionEnd = ?
       WHERE id = ?`,
      [expirationDate.toISOString(), userId]
    );

    res.json({
      success: true,
      paymentUrl: response.data.url,
      transactionId: response.data.transation_uuid,
      amount: amount,
      expiresAt: expirationDate.toISOString()
    });

  } catch (error) {
    console.error('Error en /create-qvapay:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});
module.exports = router;
