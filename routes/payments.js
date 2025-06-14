const express = require('express');
const router = express.Router();
const axios = require('axios');
const { activateUser } = require('../db'); // Importamos solo la función necesaria

const QVAPAY_CONFIG = {
  appId: '',
  appSecret: '',
  baseUrl: 'https://qvapay.com/api/v2',
  callbackUrl: 'https://taekwondo-refereeing.onrender.com/callback'
};

// Middleware de autenticación simplificado
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  next();
};

// Ruta para crear pagos (sin DB) - EXISTENTE (no cambia)
router.post('/create-qvapay', authenticateToken, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    
    // Validación básica
    if (!userId || !plan || !['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requieren userId y plan (monthly o annual)'
      });
    }

    const amount = plan === 'annual' ? 100.00 : 10.00;
    const description = `Suscripción ${plan === 'annual' ? 'Anual' : 'Mensual'} - Arbitraje Taekwondo`;

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
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.data?.transation_uuid || !response.data?.url) {
      throw new Error('Respuesta incompleta de QvaPay');
    }

    res.json({
      success: true,
      paymentUrl: response.data.url,
      transactionId: response.data.transation_uuid,
      amount: amount,
      description: description,
      expiresAfter: plan === 'annual' ? '1 año' : '1 mes'
    });

  } catch (error) {
    console.error('Error en pago:', {
      message: error.message,
      request: error.config?.data,
      response: error.response?.data
    });

    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.response?.data?.error || error.message,
      solution: 'Verifica tus credenciales en QvaPay'
    });
  }
});

// NUEVA RUTA DE CALLBACK - Se añade sin afectar lo existente
router.post('/callback', express.json(), async (req, res) => {
  try {
    const { status, remote_id, amount } = req.body;
    
    // Solo procesar pagos completados
    if (status !== 'completed') {
      return res.json({ success: true, message: 'Pago no completado' });
    }

    // Determinar el tipo de plan
    const planType = amount === 100 ? 'annual' : 'monthly';
    
    // Activar usuario usando la función de db.js
    const activationResult = await activateUser(remote_id, planType);
    
    if (!activationResult) {
      throw new Error('No se pudo activar el usuario (ID no encontrado)');
    }

    console.log(`✅ Usuario ${remote_id} activado con plan ${planType}`);
    return res.json({ success: true, message: 'Cuenta activada correctamente' });

  } catch (error) {
    console.error('Error en callback:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Error al activar la cuenta'
    });
  }
});

module.exports = router;
