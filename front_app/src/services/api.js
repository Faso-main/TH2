/* eslint-disable no-unused-vars */
// services/api.js
const API_BASE_URL = '';
const RECOMMENDATION_API_URL = ''; // Python ML сервер

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

// Базовый запрос к Recommendation API (Python ML сервер)
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
    console.log(`Recommendation API Request: ${config.method || 'GET'} ${url}`, config.body);

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Recommendation API Response:`, data);
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

// Recommendation API - Python ML сервер
export const recommendationAPI = {
  // Health check
  async health() {
    return recommendationRequest('/health');
  },

  // Получить рекомендации для пользователя
  async getUserRecommendations(userId, procurementHistory = [], options = {}) {
    return recommendationRequest('/recommendations/user', {
      method: 'POST',
      body: {
        user_id: userId,
        procurement_history: procurementHistory,
        top_n: options.top_n || 15,
        algorithm: options.algorithm || 'collaborative'
      }
    });
  },

  // Сгенерировать набор для закупки
  async generateProcurementBundle(userId, procurementHistory = [], options = {}) {
    return recommendationRequest('/recommendations/bundle', {
      method: 'POST',
      body: {
        user_id: userId,
        procurement_history: procurementHistory,
        target_budget: options.target_budget || 50000,
        max_items: options.max_items || 10,
        diversity_weight: options.diversity_weight || 0.3
      }
    });
  },

  // Получить похожие товары
  async getSimilarProducts(productId, options = {}) {
    return recommendationRequest('/recommendations/similar', {
      method: 'POST',
      body: {
        product_id: productId,
        top_n: options.top_n || 10,
        algorithm: options.algorithm || 'content_based'
      }
    });
  },

  // Получить популярные товары
  async getPopularProducts(options = {}) {
    return recommendationRequest('/recommendations/popular', {
      method: 'POST',
      body: {
        top_n: options.top_n || 20,
        category: options.category || null,
        days_back: options.days_back || 30
      }
    });
  },

  // Получить рекомендации по категории
  async getCategoryRecommendations(category, options = {}) {
    return recommendationRequest('/recommendations/category', {
      method: 'POST',
      body: {
        category: category,
        top_n: options.top_n || 15,
        user_id: options.user_id || null
      }
    });
  },

  // Обновить модель рекомендаций
  async updateModel() {
    return recommendationRequest('/model/update', {
      method: 'POST'
    });
  },

  // Получить статус модели
  async getModelStatus() {
    return recommendationRequest('/model/status');
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
          try {
            // Получаем детали закупки с товарами
            const procurementDetail = await procurementsAPI.getProcurementItems(procurement.procurement_id || procurement.id);
            
            return {
              procurement_id: procurement.procurement_id || procurement.id,
              products: procurementDetail.items?.map(item => ({
                product_id: item.product_id,
                quantity: item.required_quantity || 1,
                unit_price: item.max_price || item.unit_price || 0
              })) || [],
              total_price: procurement.estimated_price || procurement.current_price || 0,
              date: procurement.procurement_date || procurement.created_at,
              category: procurement.category || 'general'
            };
          } catch (error) {
            console.warn('Error processing procurement history:', error);
            return null;
          }
        })
      );

      // Фильтруем null значения
      const validHistory = procurementHistory.filter(Boolean);

      // 3. Получаем рекомендации от ML модели
      const recommendations = await recommendationAPI.getUserRecommendations(
        currentUser.user_id || currentUser.id, 
        validHistory,
        options
      );

      // 4. Обогащаем рекомендации дополнительной информацией о товарах
      const enrichedRecommendations = await this._enrichRecommendations(recommendations.recommendations || recommendations);

      return {
        ...recommendations,
        recommendations: enrichedRecommendations,
        history_used: validHistory.length
      };

    } catch (error) {
      console.error('Error getting personalized recommendations:', error);
      
      // Fallback: базовые рекомендации без истории
      const currentUser = authAPI.getCurrentUser();
      if (currentUser) {
        return this.getBasicRecommendations(currentUser.user_id || currentUser.id, options);
      }
      
      throw error;
    }
  },

  // Базовые рекомендации (без истории пользователя)
  async getBasicRecommendations(userId, options = {}) {
    try {
      // Используем популярные товары как fallback
      const recommendations = await recommendationAPI.getPopularProducts(options);

      const enrichedRecommendations = await this._enrichRecommendations(recommendations.recommendations || recommendations);

      return {
        ...recommendations,
        recommendations: enrichedRecommendations,
        note: 'Популярные товары (история закупок не найдена)'
      };

    } catch (error) {
      console.error('Error getting basic recommendations:', error);
      
      // Ultimate fallback: случайные товары из каталога
      try {
        const randomProducts = await productsAPI.getProducts({ limit: options.top_n || 15 });
        return {
          recommendations: randomProducts.products || randomProducts,
          note: 'Случайные товары из каталога',
          fallback: true
        };
      } catch (fallbackError) {
        throw error; // Бросаем оригинальную ошибку если fallback тоже не сработал
      }
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
          try {
            const procurementDetail = await procurementsAPI.getProcurementItems(procurement.procurement_id || procurement.id);
            
            return {
              procurement_id: procurement.procurement_id || procurement.id,
              products: procurementDetail.items?.map(item => ({
                product_id: item.product_id,
                quantity: item.required_quantity || 1,
                unit_price: item.max_price || item.unit_price || 0
              })) || [],
              total_price: procurement.estimated_price || procurement.current_price || 0
            };
          } catch (error) {
            console.warn('Error processing procurement for bundle:', error);
            return null;
          }
        })
      );

      const validHistory = procurementHistory.filter(Boolean);

      // Генерируем персонализированный набор
      const bundle = await recommendationAPI.generateProcurementBundle(
        currentUser.user_id || currentUser.id,
        validHistory,
        options
      );

      // Обогащаем информацию о товарах в наборе
      if (bundle.bundle && bundle.bundle.products) {
        bundle.bundle.products = await this._enrichRecommendations(bundle.bundle.products);
      } else if (bundle.recommended_products) {
        bundle.recommended_products = await this._enrichRecommendations(bundle.recommended_products);
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
      const enrichedSimilar = await this._enrichRecommendations(
        similarProducts.similar_products || similarProducts.recommendations || similarProducts
      );

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

  // Получить рекомендации по категории
  async getCategoryBasedRecommendations(category, options = {}) {
    try {
      const currentUser = authAPI.getCurrentUser();
      const userId = currentUser ? (currentUser.user_id || currentUser.id) : null;

      const recommendations = await recommendationAPI.getCategoryRecommendations(category, {
        ...options,
        user_id: userId
      });

      const enrichedRecommendations = await this._enrichRecommendations(
        recommendations.recommendations || recommendations
      );

      return {
        ...recommendations,
        recommendations: enrichedRecommendations,
        category: category
      };

    } catch (error) {
      console.error('Error getting category recommendations:', error);
      throw error;
    }
  },

  // Обогатить рекомендации дополнительной информацией
  async _enrichRecommendations(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return [];
    }

    try {
      // Извлекаем product_id из разных форматов ответа
      const productIds = recommendations.map(rec => {
        if (typeof rec === 'string') return rec;
        return rec.product_id || rec.id || rec;
      }).filter(Boolean);

      if (productIds.length === 0) {
        return recommendations;
      }

      // Получаем полную информацию о товарах
      const productsInfo = await productsAPI.getProductsByIds(productIds);

      // Объединяем данные
      return recommendations.map(rec => {
        const productId = typeof rec === 'string' ? rec : (rec.product_id || rec.id);
        const productInfo = Array.isArray(productsInfo) 
          ? productsInfo.find(p => (p.product_id || p.id) === productId)
          : (productsInfo.products || []).find(p => (p.product_id || p.id) === productId);

        if (typeof rec === 'string') {
          return {
            product_id: rec,
            product_details: productInfo || null,
            available: !!productInfo,
            price: productInfo?.price_per_item || productInfo?.average_price || null,
            in_stock: productInfo?.is_available !== false,
            name: productInfo?.name || 'Неизвестный товар',
            category_name: productInfo?.category_name || productInfo?.category || 'Общее'
          };
        }

        return {
          ...rec,
          product_details: productInfo || null,
          available: !!productInfo,
          price: productInfo?.price_per_item || productInfo?.average_price || rec.estimated_price || rec.price || null,
          in_stock: productInfo?.is_available !== false,
          name: productInfo?.name || rec.name || 'Неизвестный товар',
          category_name: productInfo?.category_name || productInfo?.category || rec.category_name || rec.category || 'Общее'
        };
      });

    } catch (error) {
      console.warn('Could not enrich recommendations with product details:', error);
      // Возвращаем оригинальные рекомендации если не удалось обогатить
      return recommendations.map(rec => {
        if (typeof rec === 'string') {
          return {
            product_id: rec,
            product_details: null,
            available: false,
            price: null,
            in_stock: false,
            name: 'Неизвестный товар',
            category_name: 'Общее'
          };
        }
        
        return {
          ...rec,
          product_details: null,
          available: false,
          price: rec.estimated_price || rec.price || null,
          in_stock: false
        };
      });
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
          return integratedRecommendationAPI.getBasicRecommendations(currentUser.user_id || currentUser.id, options);
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

    // Рекомендации по категории
    async getCategoryRecommendations(category, options = {}) {
      return integratedRecommendationAPI.getCategoryBasedRecommendations(category, options);
    },

    // Быстрые рекомендации (для главной страницы)
    async getQuickRecommendations(limit = 8) {
      return this.getRecommendations({ top_n: limit });
    },

    // Популярные товары
    async getPopularProducts(limit = 10) {
      try {
        const popular = await recommendationAPI.getPopularProducts({ top_n: limit });
        const enriched = await integratedRecommendationAPI._enrichRecommendations(
          popular.recommendations || popular
        );
        return {
          ...popular,
          recommendations: enriched
        };
      } catch (error) {
        console.error('Error getting popular products:', error);
        // Fallback to basic recommendations
        return this.getRecommendations({ top_n: limit });
      }
    }
  },

  // Dashboard data
  dashboard: {
    async getOverview() {
      try {
        const [procurements, recommendations, profile] = await Promise.all([
          userAPI.getMyProcurements({ limit: 5 }).catch(() => []),
          unifiedAPI.recommendations.getQuickRecommendations(6).catch(() => ({ recommendations: [] })),
          userAPI.getProfile().catch(() => ({}))
        ]);

        return {
          recent_procurements: procurements,
          recommendations: recommendations,
          user_stats: {
            total_procurements: profile.procurement_count || 0,
            total_spent: profile.total_spent || 0,
            success_rate: profile.success_rate || 0
          }
        };
      } catch (error) {
        console.error('Error getting dashboard overview:', error);
        throw error;
      }
    },

    async getStats() {
      try {
        const [procurements, participations, purchaseHistory] = await Promise.all([
          userAPI.getMyProcurements().catch(() => []),
          userAPI.getMyParticipations().catch(() => []),
          userAPI.getPurchaseHistory({ limit: 50 }).catch(() => [])
        ]);

        return {
          procurement_stats: {
            total: procurements.length,
            active: procurements.filter(p => p.status === 'active').length,
            completed: procurements.filter(p => p.status === 'completed').length,
            draft: procurements.filter(p => p.status === 'draft').length
          },
          participation_stats: {
            total: participations.length,
            active: participations.filter(p => p.status === 'active').length,
            won: participations.filter(p => p.status === 'won').length,
            lost: participations.filter(p => p.status === 'lost').length
          },
          purchase_analysis: {
            total_spent: purchaseHistory.reduce((sum, p) => sum + (p.estimated_price || p.total_price || 0), 0),
            average_order_value: purchaseHistory.length > 0 ? 
              purchaseHistory.reduce((sum, p) => sum + (p.estimated_price || p.total_price || 0), 0) / purchaseHistory.length : 0,
            total_orders: purchaseHistory.length
          }
        };
      } catch (error) {
        console.error('Error getting dashboard stats:', error);
        throw error;
      }
    }
  },

  // Search across all entities
  search: {
    async globalSearch(query, options = {}) {
      try {
        const [products, procurements, categories] = await Promise.all([
          productsAPI.searchProducts(query, { limit: options.productLimit || 5 }).catch(() => ({ products: [] })),
          procurementsAPI.getProcurements({ search: query, limit: options.procurementLimit || 5 }).catch(() => ({ procurements: [] })),
          categoriesAPI.getCategories().catch(() => [])
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
      } catch (error) {
        console.error('Error in global search:', error);
        throw error;
      }
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
  },

  // AI Features
  ai: {
    // Анализ закупки с помощью AI
    async analyzeProcurement(procurementData) {
      try {
        return await recommendationRequest('/ai/analyze-procurement', {
          method: 'POST',
          body: procurementData
        });
      } catch (error) {
        console.error('AI analysis error:', error);
        throw error;
      }
    },

    // Генерация описания закупки
    async generateProcurementDescription(procurementData) {
      try {
        return await recommendationRequest('/ai/generate-description', {
          method: 'POST',
          body: procurementData
        });
      } catch (error) {
        console.error('AI description generation error:', error);
        throw error;
      }
    },

    // Оптимизация набора товаров
    async optimizeProductBundle(products, constraints = {}) {
      try {
        return await recommendationRequest('/ai/optimize-bundle', {
          method: 'POST',
          body: {
            products: products,
            constraints: constraints
          }
        });
      } catch (error) {
        console.error('AI bundle optimization error:', error);
        throw error;
      }
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
    
    try {
      const currentUser = authAPI.getCurrentUser();
      if (currentUser) {
        results.recommendations = await unifiedAPI.recommendations.getQuickRecommendations(3);
      }
    } catch (error) {
      results.recommendations = { error: error.message };
    }
    
    return results;
  }
};

// Export default unified API
export default unifiedAPI;