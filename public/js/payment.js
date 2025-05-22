const API_URL = 'https://taekwondo-refereeing.onrender.com';
let currentPayment = null;
let paymentCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Configurar selección de plan
  document.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.plan-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
  
  // Configurar botón de pago
  document.getElementById('payWithQvaPay').addEventListener('click', createQvaPayPayment);
});

// Crear pago con QvaPay
async function createQvaPayPayment() {
  const plan = document.querySelector('.plan-btn.active').dataset.plan;
  const userId = getUserId(); // Implementa esta función
  
  try {
    const response = await fetch(`${API_URL}/api/payments/create-qvapay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({ userId, plan })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear pago');
    
    currentPayment = data;
    showPaymentStatus(data);
    
    // Abrir enlace de pago en nueva pestaña
    window.open(data.paymentUrl, '_blank');
    
    // Comenzar a verificar estado del pago
    startPaymentStatusCheck(data.qvapayId);
  } catch (error) {
    console.error('Error:', error);
    alert('Error al procesar el pago: ' + error.message);
  }
}

// Mostrar estado del pago
function showPaymentStatus(paymentData) {
  document.getElementById('payWithQvaPay').style.display = 'none';
  const statusDiv = document.getElementById('paymentStatus');
  statusDiv.style.display = 'block';
  
  document.getElementById('paymentLink').href = paymentData.paymentUrl;
}

// Verificar estado del pago periódicamente
function startPaymentStatusCheck(qvapayId) {
  let attempts = 0;
  const maxAttempts = 30; // 5 minutos (verificando cada 10 segundos)
  
  paymentCheckInterval = setInterval(async () => {
    attempts++;
    updateProgressBar((attempts / maxAttempts) * 100);
    
    try {
      const response = await fetch(`${API_URL}/api/payments/check/${qvapayId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al verificar pago');
      
      document.getElementById('paymentStatusText').textContent = 
        data.status === 'paid' ? 'Completado' : 'Pendiente';
      
      if (data.status === 'paid') {
        clearInterval(paymentCheckInterval);
        alert('¡Pago completado con éxito! Tu cuenta ha sido activada.');
        window.location.reload();
      } else if (attempts >= maxAttempts) {
        clearInterval(paymentCheckInterval);
        document.getElementById('paymentStatusText').textContent = 'Tiempo agotado';
      }
    } catch (error) {
      console.error('Error verificando pago:', error);
    }
  }, 10000); // Verificar cada 10 segundos
}

function updateProgressBar(percent) {
  document.getElementById('paymentProgress').style.width = `${percent}%`;
}

// Función para obtener el ID del usuario (debes implementarla según tu sistema)
function getUserId() {
  // Ejemplo: return localStorage.getItem('userId');
  return '123'; // Reemplaza con la lógica real
}

// Función para mostrar la sección de pagos (llamada desde el navbar)
function showPaymentSection() {
  document.getElementById('paymentSection').style.display = 'block';
}
