const express = require('express');
const router = express.Router();
const axios = require('axios');

const QVAPAY_CONFIG = {
  appId: '1c08aef4-b7e7-4266-936b-c88573e517af',
  appSecret: 'RBypDD68TBekw6QIMitIlr2juju5tnkeBqPMCoJDJ4OKX5Xz73',
  baseUrl: 'https://qvapay.com/api/v2',
  callbackUrl: 'https://taekwondo-refereeing.onrender.com/callback'
};

// Middleware de autenticación simplificado
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  next(); // En producción, verificarías el token aquí
};

// Ruta para crear pagos (sin DB)
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

    // Configuración del pago
    const amount = plan === 'annual' ? 100.00 : 10.00;
    const description = `Suscripción ${plan === 'annual' ? 'Anual' : 'Mensual'} - Arbitraje Taekwondo`;

    // Solicitud a QvaPay
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

    // Validación de respuesta
    if (!response.data?.transation_uuid || !response.data?.url) {
      throw new Error('Respuesta incompleta de QvaPay');
    }

    // Respuesta exitosa (sin guardar en DB)
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

module.exports = router;
