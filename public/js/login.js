document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en el login');
    }

    // Guardar token y redirigir
    localStorage.setItem('adminToken', data.token);
    window.location.href = '/admin.html';
    
  } catch (error) {
    console.error('Login error:', error);
    alert(error.message);
  }
});