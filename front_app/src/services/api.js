// src/services/api.js
const API_BASE_URL = 'http://localhost:5000/api';

// Утилиты для работы с localStorage
const getSessionId = () => localStorage.getItem('sessionId');
const saveSessionId = (sessionId) => localStorage.setItem('sessionId', sessionId);
const removeSessionId = () => localStorage.removeItem('sessionId');

// Базовый запрос
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Добавляем sessionId если есть
  const sessionId = getSessionId();
  if (sessionId) {
    config.headers['session-id'] = sessionId;
  }

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    console.log(`API Request: ${config.method || 'GET'} ${url}`, {
      headers: config.headers,
      body: config.body
    });

    const response = await fetch(url, config);
    
    // Проверяем Content-Type ответа
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Неверный Content-Type ответа: ${contentType}. Ответ: ${text}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`API Response: ${response.status}`, data);
    return data;

  } catch (error) {
    console.error('API request error:', {
      url,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Auth API
export const authAPI = {
  async register(userData) {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: userData,
    });
    
    if (response.sessionId) {
      saveSessionId(response.sessionId);
    }
    
    return response;
  },

  async login(credentials) {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: credentials,
    });
    
    if (response.sessionId) {
      saveSessionId(response.sessionId);
    }
    
    return response;
  },

  async logout() {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.warn('Logout error (might be expected):', error.message);
    } finally {
      removeSessionId();
    }
  },

  isAuthenticated() {
    return !!getSessionId();
  },
};

// Products API
export const productsAPI = {
  async getProducts(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    return apiRequest(`/products?${queryString}`);
  },
};

// Procurements API
export const procurementsAPI = {
  async getProcurements(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    return apiRequest(`/procurements?${queryString}`);
  },

  async participate(procurementId, data) {
    return apiRequest(`/procurements/${procurementId}/participate`, {
      method: 'POST',
      body: data,
    });
  },
};

// Test connection
export const testAPI = {
  async health() {
    return apiRequest('/health');
  }
};