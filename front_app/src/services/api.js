// services/api.js
const API_BASE_URL = '';
const RECOMMENDATION_API_URL = '';

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

// Базовый запрос к основному API
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

// Базовый запрос к Recommendation API
async function recommendationRequest(endpoint, options = {}) {
  const url = `${RECOMMENDATION_API_URL}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    console.log(`Recommendation API Request: ${config.method || 'GET'} ${url}`);

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Recommendation API request error:', error);
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
    if (filters.offset) queryParams.append('offset', filters.offset);
    
    return apiRequest(`/products?${queryParams.toString()}`);
  },

  async getProduct(id) {
    return apiRequest(`/products/${id}`);
  },

  async searchProducts(query, filters = {}) {
    const queryParams = new URLSearchParams();
    queryParams.append('search', query);
    
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.minPrice) queryParams.append('minPrice', filters.minPrice);
    if (filters.maxPrice) queryParams.append('maxPrice', filters.maxPrice);
    if (filters.limit) queryParams.append('limit', filters.limit);
    
    return apiRequest(`/products?${queryParams.toString()}`);
  },

  async getProductsByIds(productIds) {
    return apiRequest('/products/batch', {
      method: 'POST',
      body: { product_ids: productIds }
    });
  }
};

// Categories API
export const categoriesAPI = {
  async getCategories() {
    return apiRequest('/categories');
  },

  async getCategory(id) {
    return apiRequest(`/categories/${id}`);
  },

  async getCategoryProducts(categoryId, filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.offset) queryParams.append('offset', filters.offset);
    
    return apiRequest(`/categories/${categoryId}/products?${queryParams.toString()}`);
  }
};

// Procurements API
export const procurementsAPI = {
  async getProcurements(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.offset) queryParams.append('offset', filters.offset);
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.search) queryParams.append('search', filters.search);
    
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
  },

  async getProcurementItems(procurementId) {
    return apiRequest(`/procurements/${procurementId}/items`);
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

  async getMyProcurements(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.offset) queryParams.append('offset', filters.offset);
    
    return apiRequest(`/user/my-procurements?${queryParams.toString()}`);
  },

  async getMyParticipations(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.offset) queryParams.append('offset', filters.offset);
    
    return apiRequest(`/user/my-participations?${queryParams.toString()}`);
  },

  async changePassword(passwordData) {
    return apiRequest('/user/change-password', {
      method: 'POST',
      body: passwordData,
    });
  },

  async getPurchaseHistory(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    if (filters.limit) queryParams.append('limit', filters.limit);
    
    return apiRequest(`/user/purchase-history?${queryParams.toString()}`);
  }
};

// Recommendation API
export const recommendationAPI = {
  // Health check
  async health() {
    return recommendationRequest('/health');
  },

  // Получить рекомендации для пользователя
  async getUserRecommendations(userId, procurementHistory = [], options = {}) {
    return recommendationRequest(`/recommendations/user/${userId}`, {
      method: 'POST',
      body: {
        procurement_history: procurementHistory,
        top_n: options.top_n || 15
      }
    });
  },

  // Сгенерировать набор для закупки
  async generateProcurementBundle(userId, procurementHistory = [], options = {}) {
    return recommendationRequest(`/recommendations/bundle/${userId}`, {
      method: 'POST',
      body: {
        procurement_history: procurementHistory,
        target_budget: options.target_budget || 50000,
        max_items: options.max_items || 10
      }
    });
  },

  // Получить похожие товары
  async getSimilarProducts(productId, options = {}) {
    const queryParams = new URLSearchParams();
    if (options.top_n) queryParams.append('top_n', options.top_n);
    
    return recommendationRequest(`/recommendations/similar/${productId}?${queryParams.toString()}`);
  },

  // Получить информацию о товаре
  async getProductInfo(productId) {
    return recommendationRequest(`/products/${productId}`);
  },

  // Получить профиль пользователя
  async getUserProfile(userId) {
    return recommendationRequest(`/users/${userId}/profile`);
  }
};

// Integrated Recommendation API (объединяет основное API и рекомендации)
export const integratedRecommendationAPI = {
  // Получить персонализированные рекомендации с автоматическим сбором истории
  async getPersonalizedRecommendations(options = {}) {
    try {
      const currentUser = authAPI.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // 1. Получаем историю закупок пользователя
      const procurements = await userAPI.getMyProcurements();
      
      // 2. Преобразуем историю в формат для рекомендательной системы
      const procurementHistory = await Promise.all(
        procurements.map(async (procurement) => {
          // Получаем детали закупки с товарами
          const procurementDetail = await procurementsAPI.getProcurementItems(procurement.procurement_id);
          
          return {
            products: procurementDetail.items?.map(item => item.product_id) || [],
            estimated_price: procurement.estimated_price || 0,
            date: procurement.procurement_date
          };
        })
      );

      // 3. Получаем рекомендации от ML модели
      const recommendations = await recommendationAPI.getUserRecommendations(
        currentUser.user_id, 
        procurementHistory,
        options
      );

      // 4. Обогащаем рекомендации дополнительной информацией о товарах
      const enrichedRecommendations = await this._enrichRecommendations(recommendations.recommendations);

      return {
        ...recommendations,
        recommendations: enrichedRecommendations
      };

    } catch (error) {
      console.error('Error getting personalized recommendations:', error);
      
      // Fallback: базовые рекомендации без истории
      const currentUser = authAPI.getCurrentUser();
      if (currentUser) {
        return this.getBasicRecommendations(currentUser.user_id, options);
      }
      
      throw error;
    }
  },

  // Базовые рекомендации (без истории пользователя)
  async getBasicRecommendations(userId, options = {}) {
    try {
      const recommendations = await recommendationAPI.getUserRecommendations(
        userId, 
        [], // Пустая история
        options
      );

      const enrichedRecommendations = await this._enrichRecommendations(recommendations.recommendations);

      return {
        ...recommendations,
        recommendations: enrichedRecommendations,
        note: 'Базовые рекомендации (история закупок не найдена)'
      };

    } catch (error) {
      console.error('Error getting basic recommendations:', error);
      throw error;
    }
  },

  // Сгенерировать умный набор для закупки
  async generateSmartProcurementBundle(options = {}) {
    try {
      const currentUser = authAPI.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Получаем историю для персонализации
      const procurements = await userAPI.getMyProcurements();
      const procurementHistory = await Promise.all(
        procurements.map(async (procurement) => {
          const procurementDetail = await procurementsAPI.getProcurementItems(procurement.procurement_id);
          
          return {
            products: procurementDetail.items?.map(item => item.product_id) || [],
            estimated_price: procurement.estimated_price || 0
          };
        })
      );

      // Генерируем персонализированный набор
      const bundle = await recommendationAPI.generateProcurementBundle(
        currentUser.user_id,
        procurementHistory,
        options
      );

      // Обогащаем информацию о товарах в наборе
      if (bundle.bundle && bundle.bundle.products) {
        bundle.bundle.products = await this._enrichRecommendations(bundle.bundle.products);
      }

      return bundle;

    } catch (error) {
      console.error('Error generating smart bundle:', error);
      throw error;
    }
  },

  // Получить рекомендации на основе текущего товара
  async getContextualRecommendations(productId, options = {}) {
    try {
      // Получаем похожие товары
      const similarProducts = await recommendationAPI.getSimilarProducts(productId, options);
      
      // Получаем информацию о текущем товаре
      const currentProduct = await productsAPI.getProduct(productId);
      
      // Обогащаем похожие товары дополнительной информацией
      const enrichedSimilar = await this._enrichRecommendations(similarProducts.similar_products);

      return {
        current_product: currentProduct,
        similar_products: enrichedSimilar,
        context: 'similar_items'
      };

    } catch (error) {
      console.error('Error getting contextual recommendations:', error);
      throw error;
    }
  },

  // Обогатить рекомендации дополнительной информацией
  async _enrichRecommendations(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return [];
    }

    try {
      // Получаем полную информацию о товарах
      const productIds = recommendations.map(rec => rec.product_id);
      const productsInfo = await productsAPI.getProductsByIds(productIds);

      // Объединяем данные
      return recommendations.map(rec => {
        const productInfo = productsInfo.find(p => p.product_id === rec.product_id);
        return {
          ...rec,
          product_details: productInfo || null,
          available: !!productInfo,
          price: productInfo?.average_price || rec.estimated_price || null,
          in_stock: productInfo?.is_available || false
        };
      });

    } catch (error) {
      console.warn('Could not enrich recommendations with product details:', error);
      // Возвращаем оригинальные рекомендации если не удалось обогатить
      return recommendations.map(rec => ({
        ...rec,
        product_details: null,
        available: false,
        price: rec.estimated_price || null,
        in_stock: false
      }));
    }
  }
};

// Unified API (основной интерфейс для использования в приложении)
export const unifiedAPI = {
  // Auth
  auth: authAPI,

  // Products
  products: productsAPI,

  // Categories
  categories: categoriesAPI,

  // Procurements
  procurements: procurementsAPI,

  // User
  user: userAPI,

  // Recommendations
  recommendations: {
    // Основные методы рекомендаций
    async getRecommendations(options = {}) {
      try {
        return await integratedRecommendationAPI.getPersonalizedRecommendations(options);
      } catch (error) {
        console.error('Failed to get personalized recommendations, falling back to basic:', error);
        
        const currentUser = authAPI.getCurrentUser();
        if (currentUser) {
          return integratedRecommendationAPI.getBasicRecommendations(currentUser.user_id, options);
        }
        
        throw new Error('Cannot get recommendations: user not authenticated');
      }
    },

    // Генерация набора для закупки
    async generateBundle(options = {}) {
      return integratedRecommendationAPI.generateSmartProcurementBundle(options);
    },

    // Контекстные рекомендации (похожие товары)
    async getSimilarToProduct(productId, options = {}) {
      return integratedRecommendationAPI.getContextualRecommendations(productId, options);
    },

    // Быстрые рекомендации (для главной страницы)
    async getQuickRecommendations(limit = 8) {
      return this.getRecommendations({ top_n: limit });
    },

    // Рекомендации по категории
    async getCategoryRecommendations(category, limit = 10) {
      const allRecommendations = await this.getRecommendations({ top_n: 20 });
      
      const filtered = allRecommendations.recommendations.filter(rec => 
        rec.product_category.toLowerCase().includes(category.toLowerCase())
      ).slice(0, limit);

      return {
        ...allRecommendations,
        recommendations: filtered,
        category: category
      };
    }
  },

  // Dashboard data
  dashboard: {
    async getOverview() {
      const [procurements, recommendations, profile] = await Promise.all([
        userAPI.getMyProcurements({ limit: 5 }),
        unifiedAPI.recommendations.getQuickRecommendations(6),
        userAPI.getProfile()
      ]);

      return {
        recent_procurements: procurements,
        recommendations: recommendations,
        user_stats: {
          total_procurements: profile.procurement_count || 0,
          total_spent: profile.total_spent || 0
        }
      };
    },

    async getStats() {
      const [procurements, participations, purchaseHistory] = await Promise.all([
        userAPI.getMyProcurements(),
        userAPI.getMyParticipations(),
        userAPI.getPurchaseHistory({ limit: 50 })
      ]);

      return {
        procurement_stats: {
          total: procurements.length,
          active: procurements.filter(p => p.status === 'active').length,
          completed: procurements.filter(p => p.status === 'completed').length
        },
        participation_stats: {
          total: participations.length,
          active: participations.filter(p => p.status === 'active').length,
          won: participations.filter(p => p.status === 'won').length
        },
        purchase_analysis: {
          total_spent: purchaseHistory.reduce((sum, p) => sum + (p.estimated_price || 0), 0),
          average_order_value: purchaseHistory.length > 0 ? 
            purchaseHistory.reduce((sum, p) => sum + (p.estimated_price || 0), 0) / purchaseHistory.length : 0
        }
      };
    }
  },

  // Search across all entities
  search: {
    async globalSearch(query, options = {}) {
      const [products, procurements, categories] = await Promise.all([
        productsAPI.searchProducts(query, { limit: options.productLimit || 5 }),
        procurementsAPI.getProcurements({ search: query, limit: options.procurementLimit || 5 }),
        categoriesAPI.getCategories() // Фильтруем категории на клиенте
      ]);

      const filteredCategories = categories.filter(category => 
        category.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, options.categoryLimit || 3);

      return {
        query,
        products: products.products || products,
        procurements: procurements.procurements || procurements,
        categories: filteredCategories,
        total_results: (products.products || products).length + 
                      (procurements.procurements || procurements).length + 
                      filteredCategories.length
      };
    },

    async advancedSearch(filters) {
      const queryParams = new URLSearchParams();
      
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          queryParams.append(key, filters[key]);
        }
      });

      return apiRequest(`/search?${queryParams.toString()}`);
    }
  }
};

// Test connection
export const testAPI = {
  async health() {
    return apiRequest('/health');
  },

  async testAllEndpoints() {
    const results = {};
    
    try {
      results.main_api = await this.health();
    } catch (error) {
      results.main_api = { error: error.message };
    }
    
    try {
      results.recommendation_api = await recommendationAPI.health();
    } catch (error) {
      results.recommendation_api = { error: error.message };
    }
    
    try {
      results.categories = await categoriesAPI.getCategories();
    } catch (error) {
      results.categories = { error: error.message };
    }
    
    return results;
  }
};

// Export default unified API
export default unifiedAPI;