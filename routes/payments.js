const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db'); // Asegúrate de tener tu configuración de DB

// Configuración QvaPay
const QVAPAY_CONFIG = {
  appId: '6d094ea5-8668-496c-b741-e177f1510357',
  appSecret: 'k71eVMnaJwJL9bnPOECmfC9Zi9I1qhfhZxHAsUFa4qe0823dMj',
  baseUrl: 'https://qvapay.com/api/v1',
  callbackUrl: 'https://arbitraje-taekwondo.onrender.com/callback',
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
      `INSERT INTO payments 
       (userId, amount, paymentMethod, status, transactionId, expirationDate)
       VALUES (?, ?, 'qvapay', 'pending', ?, datetime('now', ?))`,
      [userId, amount, response.data.uuid, plan === 'annual' ? '+12 months' : '+1 month'],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
          paymentUrl: response.data.url,
          qvapayId: response.data.uuid,
          amount,
          expiresAt: response.data.expires_at
        });
      }
    );
  } catch (error) {
    console.error('Error creating QvaPay invoice:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al crear pago con QvaPay' });
  }
});

// Callback de QvaPay
router.post('/callback', express.json(), async (req, res) => {
  try {
    const { uuid, status, remote_id } = req.body;
    
    const paymentInfo = await axios.get(`${QVAPAY_CONFIG.baseUrl}/get_info`, {
      params: {
        app_id: QVAPAY_CONFIG.appId,
        app_secret: QVAPAY_CONFIG.appSecret,
        id: uuid
      }
    });

    if (paymentInfo.data.status !== 'paid') {
      return res.status(400).json({ error: 'Pago no completado' });
    }

    db.run(
      `UPDATE payments SET 
       status = 'completed',
       paymentDate = datetime('now')
       WHERE transactionId = ? AND status = 'pending'`,
      [uuid],
      function(err) {
        if (err) throw err;
        
        db.run(
          `UPDATE users SET 
           isActive = 1, 
           paymentDate = datetime('now'), 
           subscriptionEnd = (
             SELECT expirationDate FROM payments WHERE transactionId = ?
           )
           WHERE id = ?`,
          [uuid, remote_id],
          function(err) {
            if (err) throw err;
            res.status(200).send('OK');
          }
        );
      }
    );
  } catch (error) {
    console.error('Error en callback:', error);
    res.status(500).send('Error');
  }
});

// Verificar estado de pago
router.get('/check/:qvapayId', authenticateToken, async (req, res) => {
  try {
    const { qvapayId } = req.params;
    
    const paymentInfo = await axios.get(`${QVAPAY_CONFIG.baseUrl}/get_info`, {
      params: {
        app_id: QVAPAY_CONFIG.appId,
        app_secret: QVAPAY_CONFIG.appSecret,
        id: qvapayId
      }
    });

    res.json({
      status: paymentInfo.data.status,
      amount: paymentInfo.data.amount,
      paidAt: paymentInfo.data.paid_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar pago' });
  }
});

module.exports = router;