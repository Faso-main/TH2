// services/api.js
const API_BASE_URL = '';

// Утилиты для работы с localStorage
const getSessionId = () => localStorage.getItem('sessionId');
const saveSessionId = (sessionId) => localStorage.setItem('sessionId', sessionId);
const removeSessionId = () => localStorage.removeItem('sessionId');
const saveCurrentUser = (user) => localStorage.setItem('currentUser', JSON.stringify(user));
const getCurrentUser = () => {
  const userStr = localStorage.getItem('currentUser');
  return userStr ? JSON.parse(userStr) : null;
};
const removeCurrentUser = () => localStorage.removeItem('currentUser');

// Базовый запрос
async function apiRequest(endpoint, options = {}) {
  const url = `/api${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
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
    
    if (response.user) {
      saveCurrentUser(response.user);
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
    
    if (response.user) {
      saveCurrentUser(response.user);
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
      removeCurrentUser();
    }
  },

  isAuthenticated() {
    return !!getSessionId();
  },

  getCurrentUser() {
    return getCurrentUser();
  }
};

// Products API
export const productsAPI = {
  async getProducts(filters = {}) {
    const queryParams = new URLSearchParams();
    
    // Преобразуем параметры под серверные названия
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.minPrice) queryParams.append('minPrice', filters.minPrice);
    if (filters.maxPrice) queryParams.append('maxPrice', filters.maxPrice);
    if (filters.search) queryParams.append('search', filters.search);
    if (filters.limit) queryParams.append('limit', filters.limit);
    
    return apiRequest(`/products?${queryParams.toString()}`);
  },

  async getProduct(id) {
    return apiRequest(`/products/${id}`);
  },

  async searchProducts(query) {
    return apiRequest(`/products?search=${encodeURIComponent(query)}`);
  }
};

// Categories API
export const categoriesAPI = {
  async getCategories() {
    return apiRequest('/categories');
  }
};

// Procurements API
export const procurementsAPI = {
  async getProcurements(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.limit) queryParams.append('limit', filters.limit);
    
    return apiRequest(`/procurements?${queryParams.toString()}`);
  },

  async getProcurement(id) {
    return apiRequest(`/procurements/${id}`);
  },

  async create(procurementData) {
    return apiRequest('/procurements', {
      method: 'POST',
      body: procurementData,
    });
  },

  async update(id, procurementData) {
    return apiRequest(`/procurements/${id}`, {
      method: 'PUT',
      body: procurementData,
    });
  },

  async delete(id) {
    return apiRequest(`/procurements/${id}`, {
      method: 'DELETE',
    });
  },

  async participate(procurementId, data) {
    return apiRequest(`/procurements/${procurementId}/participate`, {
      method: 'POST',
      body: data,
    });
  },

  async getParticipants(procurementId) {
    return apiRequest(`/procurements/${procurementId}/participants`);
  }
};

// User Profile API
export const userAPI = {
  async getProfile() {
    return apiRequest('/user/profile');
  },

  async updateProfile(userData) {
    const response = await apiRequest('/user/profile', {
      method: 'PUT',
      body: userData,
    });
    
    if (response.user) {
      saveCurrentUser(response.user);
    }
    
    return response;
  },

  async getMyProcurements() {
    return apiRequest('/user/my-procurements');
  },

  async getMyParticipations() {
    return apiRequest('/user/my-participations');
  },

  async changePassword(passwordData) {
    return apiRequest('/user/change-password', {
      method: 'POST',
      body: passwordData,
    });
  }
};

// Test connection
export const testAPI = {
  async health() {
    return apiRequest('/health');
  }
};

// services/api.js - добавь этот метод
export const unifiedAPI = {
  recommendations: {
    async getQuickRecommendations(limit = 8) {
      try {
        const sessionId = localStorage.getItem('sessionId');
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        
        if (!currentUser) {
          console.warn('No user found for recommendations');
          return getFallbackRecommendations(limit);
        }

        // Пробуем новый emergency endpoint
        const response = await fetch('/api/emergency-recommendations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'session-id': sessionId || ''
          },
          body: JSON.stringify({
            user_id: currentUser.user_id,
            limit: limit
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Форматируем рекомендации
        const recommendations = data.recommendations?.map(rec => ({
          id: rec.product_id,
          name: rec.product_name,
          category_name: rec.product_category,
          price_per_item: rec.price_range?.avg || rec.real_price || 1000,
          total_score: rec.total_score || 0.7,
          explanation: rec.explanation,
          in_catalog: rec.in_catalog,
          is_available: rec.is_available
        })) || [];

        return {
          success: true,
          recommendations: recommendations,
          count: recommendations.length,
          source: data.engine || 'emergency_fix'
        };

      } catch (error) {
        console.warn('Emergency recommendations failed, using fallback:', error);
        return getFallbackRecommendations(limit);
      }
    }
  }
};

// Fallback рекомендации
function getFallbackRecommendations(limit) {
  const fallbackProducts = [
    {
      id: '35600326',
      name: 'Принтер лазерный HP LaserJet Pro MFP M428fdw',
      category_name: 'Офисная техника',
      price_per_item: 28900,
      total_score: 0.89,
      explanation: 'Популярная модель для офиса',
      in_catalog: true,
      is_available: true
    },
    {
      id: '36731994', 
      name: 'Бумага для офисной техники Снегурочка А4',
      category_name: 'Канцелярия',
      price_per_item: 379,
      total_score: 0.76,
      explanation: 'Часто покупаемый товар',
      in_catalog: true,
      is_available: true
    },
    {
      id: '34368176',
      name: 'Калькулятор настольный CITIZEN SDC-444S',
      category_name: 'Офисная техника', 
      price_per_item: 1923,
      total_score: 0.82,
      explanation: 'Надежная модель для расчетов',
      in_catalog: true,
      is_available: true
    }
  ];
  
  return {
    success: true,
    recommendations: fallbackProducts.slice(0, limit),
    count: Math.min(limit, fallbackProducts.length),
    source: 'fallback'
  };
}