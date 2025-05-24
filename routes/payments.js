const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db'); // Asegúrate de que esto exporte una conexión válida

// Configuración QvaPay
const QVAPAY_CONFIG = {
  appId: '1c08aef4-b7e7-4266-936b-c88573e517af',
  appSecret: 'RBypDD68TBekw6QIMitIlr2juju5tnkeBqPMCoJDJ4OKX5Xz73',
  baseUrl: 'https://qvapay.com/api/v2',
  callbackUrl: 'https://taekwondo-refereeing.onrender.com/callback',
};

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  // Aquí iría la lógica de verificación del token
  next();
};

// Función para ejecutar consultas SQL con promesas
const dbQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

router.post('/create-qvapay', authenticateToken, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    
    if (!userId || !plan) {
      return res.status(400).json({ error: 'Faltan campos requeridos: userId o plan' });
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

    // Validar respuesta de QvaPay (usando transation_uuid en lugar de uuid)
    if (!response.data || typeof response.data !== 'object') {
      throw new Error(`La respuesta de QvaPay no es un objeto válido: ${JSON.stringify(response.data)}`);
    }

    if (!response.data.transation_uuid) {
      throw new Error(`Falta el transation_uuid en la respuesta: ${JSON.stringify(response.data)}`);
    }

    if (!response.data.url) {
      throw new Error(`Falta la URL de pago en la respuesta: ${JSON.stringify(response.data)}`);
    }

    // Guardar en DB
    const expirationDate = plan === 'annual' ? 
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const sql = `
      INSERT INTO payments (user_id, amount, plan_type, qvapay_id, expiration_date, status) 
      VALUES (?, ?, ?, ?, ?, 'pending')
    `;
    
    await dbQuery(sql, [
      userId, 
      amount, 
      plan, 
      response.data.transation_uuid, // Usamos transation_uuid aquí
      expirationDate
    ]);

    res.json({
      success: true,
      paymentUrl: response.data.url,
      qvapayId: response.data.transation_uuid, // Y aquí también
      amount,
      description,
      expiresAt: expirationDate.toISOString()
    });

  } catch (error) {
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
    const statusCode = error.response?.status || 500;
    
    res.status(statusCode).json({ 
      success: false,
      error: error.message || 'Error al procesar el pago',
      details: error.response?.data || null
    });
  
module.exports = router; 
