async function loadPendingUsers() {
  try {
    // Mostrar estado de carga
    document.getElementById('message-container').innerHTML = `
      <div class="loading-message">Cargando usuarios pendientes...</div>
    `;

    const token = localStorage.getItem('adminToken');
    if (!token) throw new Error('No hay token de administrador');

    const response = await fetch('/api/admin/pending-users', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error al cargar usuarios');
    }

    const users = await response.json();
    renderUsers(users);
    
  } catch (error) {
    console.error('Error:', error);
    showError(error.message);
    
    // Redirigir si es error de autenticación
    if (error.message.includes('token') || error.message.includes('autorizado')) {
      localStorage.removeItem('adminToken');
      window.location.href = '/login.html';
    }
  }
}

function renderUsers(users) {
  const tbody = document.querySelector('#pendingUsers tbody');
  const messageContainer = document.getElementById('message-container');
  
  // Limpiar mensajes previos
  messageContainer.innerHTML = '';
  
  if (!Array.isArray(users)) {
    showError('Formato de datos inválido');
    return;
  }

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr class="no-data">
        <td colspan="5">No hay usuarios pendientes</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${user.email || 'N/A'}</td>
      <td>${user.paymentDate ? formatDate(user.paymentDate) : 'N/A'}</td>
      <td class="${user.paymentVerified ? 'verified' : 'pending'}">
        ${user.paymentVerified ? 'Verificado' : 'Pendiente'}
      </td>
      <td>
        <select class="form-select">
          <option value="1">1 mes</option>
          <option value="3">3 meses</option>
          <option value="12" selected>1 año</option>
        </select>
      </td>
      <td>
        <button class="btn-activate" data-user-id="${user.id}">
          Activar
        </button>
      </td>
    </tr>
  `).join('');

  // Agregar event listeners a los botones
  document.querySelectorAll('.btn-activate').forEach(btn => {
    btn.addEventListener('click', activateUser);
  });
}

// Función auxiliar para formato de fecha
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('es-ES', options);
}

// Función para mostrar errores
function showError(message) {
  const container = document.getElementById('message-container');
  container.innerHTML = `
    <div class="error-message">
      <strong>Error:</strong> ${message}
    </div>
  `;
}

// Función para activar usuario
async function activateUser(event) {
  const button = event.target;
  const userId = button.dataset.userId;
  const duration = button.closest('tr').querySelector('select').value;
  
  try {
    button.disabled = true;
    button.textContent = 'Procesando...';
    
    const response = await fetch('/api/admin/activate-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ userId, months: duration })
    });
    
    const result = await response.json();
    
    if (!response.ok) throw new Error(result.error || 'Error al activar usuario');
    
    // Recargar la lista
    loadPendingUsers();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = 'Activar';
  }
}

// Cargar usuarios al iniciar
document.addEventListener('DOMContentLoaded', loadPendingUsers);