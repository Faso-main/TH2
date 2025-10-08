// services/api.js
const API_BASE_URL = '';

// Функция для работы с API
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}

// Auth API
export const authAPI = {
  async login(email, password) {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    
    if (data.token) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
    }
    
    return data;
  },

  async register(userData) {
    const data = await apiCall('/auth/register', {
      method: 'POST',
      body: userData
    });
    
    if (data.token) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
    }
    
    return data;
  },

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated() {
    return !!localStorage.getItem('authToken');
  }
};

// Products API
export const productsAPI = {
  async getProducts(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return await apiCall(`/products?${queryParams}`);
  },

  async getProduct(id) {
    return await apiCall(`/products/${id}`);
  }
};

// Procurements API
export const procurementsAPI = {
  async getProcurements(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return await apiCall(`/procurements?${queryParams}`);
  },

  async getProcurement(id) {
    return await apiCall(`/procurements/${id}`);
  },

  async participate(procurementId, proposalData) {
    return await apiCall(`/procurements/${procurementId}/participate`, {
      method: 'POST',
      body: proposalData
    });
  }
};

// User Profile API
export const userAPI = {
  async getProfile() {
    return await apiCall('/user/profile');
  },

  async updateProfile(userData) {
    return await apiCall('/user/profile', {
      method: 'PUT',
      body: userData
    });
  },

  async getMyProcurements() {
    return await apiCall('/user/my-procurements');
  },

  async getMyParticipations() {
    return await apiCall('/user/my-participations');
  }
};