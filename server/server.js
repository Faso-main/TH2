import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import pkg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pkg;
const app = express();
const PORT = 5000;

// =============================================
// КОНФИГУРАЦИЯ
// =============================================

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://faso312.ru'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'session-id',
    'Referer',
    'sec-ch-ua',
    'sec-ch-ua-mobile', 
    'sec-ch-ua-platform',
    'User-Agent'
  ],
  exposedHeaders: ['session-id']
};

// PostgreSQL connection
const pool = new Pool({
  user: 'store_app1',
  host: 'localhost',
  database: 'pc_db',
  password: '1234',
  port: 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Простое хранилище сессий
const sessions = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

// =============================================
// MIDDLEWARE
// =============================================

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Логирование входящих запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
    'session-id': req.headers['session-id'],
    'origin': req.headers['origin']
  });
  next();
});

// Обработка OPTIONS запросов для CORS preflight
app.options('*', cors(corsOptions));

// Auth middleware
const checkSession = (req, res, next) => {
  const sessionId = req.headers['session-id'];
  console.log('Session check:', { sessionId, hasSession: sessions.has(sessionId) });
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  req.user = sessions.get(sessionId);
  next();
};

// Обработчик ошибок
const errorHandler = (error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Внутренняя ошибка сервера',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// =============================================
// УМНЫЙ ПОИСК
// =============================================

// Анализ поискового запроса
function analyzeSearchQuery(query) {
  const analysis = {
    query_type: 'general',
    likely_categories: [],
    price_range: null,
    features: [],
    is_specific: false,
    is_technical: false,
    is_brand: false
  };

  const queryLower = query.toLowerCase();
  
  // Определяем категории по ключевым словам
  const categoryKeywords = {
    'Канцелярия': ['ручка', 'карандаш', 'ластик', 'блокнот', 'тетрадь', 'степлер', 'дырокол', 'скрепка', 'бумага'],
    'Электроника': ['смартфон', 'телефон', 'ноутбук', 'компьютер', 'планшет', 'наушники', 'кабель', 'usb', 'зарядка'],
    'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'ламинатор', 'брошюратор'],
    'Хозтовары': ['мыло', 'туалетная', 'бумага', 'моющее', 'чистящее', 'перчатки', 'мешки'],
    'Мебель': ['стол', 'стул', 'кресло', 'шкаф', 'полка', 'стеллаж'],
    'IT оборудование': ['сервер', 'роутер', 'свитч', 'монитор', 'клавиатура', 'мышь'],
    'Строительные материалы': ['краска', 'лак', 'кисть', 'валик', 'инструмент', 'дрель', 'шуруповерт'],
    'Расходные материалы': ['картридж', 'тонер', 'пленка', 'чернила', 'бумага']
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      analysis.likely_categories.push(category);
    }
  }

  // Ищем указание цены
  const priceMatch = query.match(/(\d+)\s*-\s*(\d+)\s*руб/) || query.match(/(\d+)\s*руб/);
  if (priceMatch) {
    analysis.price_range = priceMatch[2] 
      ? { min: parseInt(priceMatch[1]), max: parseInt(priceMatch[2]) }
      : { max: parseInt(priceMatch[1]) };
  }

  // Определяем технические характеристики
  const techSpecs = ['gb', 'тб', 'мбайт', 'ггц', 'дюйм', 'мм', 'см', 'м'];
  analysis.is_technical = techSpecs.some(spec => queryLower.includes(spec));

  // Определяем бренды
  const brands = ['samsung', 'apple', 'xiaomi', 'hp', 'dell', 'lenovo', 'asus', 'lg', 'bosch', 'makita'];
  analysis.is_brand = brands.some(brand => queryLower.includes(brand));

  // Определяем специфичность запроса
  analysis.is_specific = query.split(' ').length >= 2 || 
                        analysis.likely_categories.length > 0 ||
                        analysis.price_range !== null ||
                        analysis.is_technical;

  return analysis;
}

// Умный поиск товаров
async function searchProducts(query, limit, analysis) {
  try {
    const searchTerms = query.split(' ').filter(term => term.length > 1);
    
    let sqlQuery = `
      SELECT DISTINCT
        p.product_id as id,
        p.name,
        p.description,
        p.manufacturer as company,
        p.average_price as price_per_item,
        p.unit_of_measure,
        p.specifications,
        p.is_available,
        c.name as category_name,
        c.category_id,
        ts_rank(to_tsvector('russian', 
          COALESCE(p.name, '') || ' ' || 
          COALESCE(p.description, '') || ' ' ||
          COALESCE(p.manufacturer, '') || ' ' ||
          COALESCE(c.name, '')
        ), plainto_tsquery('russian', $1)) as rank,
        LENGTH(p.name) as name_length
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_available = true
        AND (
          to_tsvector('russian', 
            COALESCE(p.name, '') || ' ' || 
            COALESCE(p.description, '') || ' ' ||
            COALESCE(p.manufacturer, '') || ' ' ||
            COALESCE(c.name, '')
          ) @@ plainto_tsquery('russian', $1)
    `;

    const params = [query];
    let paramCount = 1;

    // Если есть конкретные категории, добавляем фильтр
    if (analysis.likely_categories.length > 0) {
      paramCount++;
      sqlQuery += ` OR c.name ILIKE ANY($${paramCount})`;
      params.push(analysis.likely_categories.map(cat => `%${cat}%`));
    }

    // Добавляем поиск по отдельным словам для лучшего покрытия
    if (searchTerms.length > 1) {
      const likeConditions = searchTerms.map(() => {
        paramCount++;
        return `(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.manufacturer ILIKE $${paramCount})`;
      });
      sqlQuery += ` OR (${likeConditions.join(' AND ')})`;
      params.push(...searchTerms.map(term => `%${term}%`));
    }

    sqlQuery += `)
      ORDER BY 
        -- Приоритет точным совпадениям в названии
        CASE 
          WHEN p.name ILIKE $${paramCount + 1} THEN 3
          WHEN p.name ILIKE $${paramCount + 2} THEN 2
          ELSE 1 
        END DESC,
        rank DESC,
        p.average_price DESC
      LIMIT $${paramCount + 3}`;

    params.push(`%${query}%`, `%${query.split(' ')[0]}%`, limit);

    const result = await pool.query(sqlQuery, params);
    
    return result.rows.map(row => ({
      ...row,
      search_score: row.rank,
      match_type: determineMatchType(row, query),
      relevance: calculateRelevance(row, query, analysis)
    }));

  } catch (error) {
    console.error('Product search error:', error);
    return [];
  }
}

// Определение типа совпадения
function determineMatchType(row, query) {
  const queryLower = query.toLowerCase();
  const nameLower = row.name.toLowerCase();
  
  if (nameLower.includes(queryLower)) return 'exact';
  if (row.rank > 0.3) return 'high';
  if (row.rank > 0.1) return 'medium';
  return 'related';
}

// Расчет релевантности
function calculateRelevance(row, query, analysis) {
  let score = row.rank;
  const queryLower = query.toLowerCase();
  const nameLower = row.name.toLowerCase();
  
  // Бонус за точное совпадение в названии
  if (nameLower.includes(queryLower)) score += 0.5;
  
  // Бонус за совпадение категории
  if (analysis.likely_categories.includes(row.category_name)) score += 0.3;
  
  // Бонус за бренд в названии
  if (analysis.is_brand && row.company) {
    const brandInName = analysis.likely_categories.some(brand => 
      nameLower.includes(brand.toLowerCase())
    );
    if (brandInName) score += 0.2;
  }
  
  return Math.min(score, 1.0);
}

// Умный поиск закупок
async function searchProcurements(query, limit, analysis) {
  try {
    const searchTerms = query.split(' ').filter(term => term.length > 1);
    
    let sqlQuery = `
      SELECT DISTINCT
        p.procurement_id as id,
        p.name as title,
        p.description,
        p.estimated_price as current_price,
        p.actual_price,
        p.status,
        p.procurement_date,
        p.publication_date,
        p.organization_name as customer_name,
        p.organization_inn as customer_inn,
        p.created_at,
        ts_rank(to_tsvector('russian', 
          COALESCE(p.name, '') || ' ' || 
          COALESCE(p.description, '')
        ), plainto_tsquery('russian', $1)) as rank
      FROM procurements p
      WHERE to_tsvector('russian', 
        COALESCE(p.name, '') || ' ' || 
        COALESCE(p.description, '')
      ) @@ plainto_tsquery('russian', $1)
    `;

    const params = [query];
    let paramCount = 1;

    // Добавляем поиск по отдельным словам
    if (searchTerms.length > 1) {
      const likeConditions = searchTerms.map(() => {
        paramCount++;
        return `(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.organization_name ILIKE $${paramCount})`;
      });
      sqlQuery += ` OR (${likeConditions.join(' AND ')})`;
      params.push(...searchTerms.map(term => `%${term}%`));
    }

    sqlQuery += `
      ORDER BY 
        rank DESC,
        p.created_at DESC
      LIMIT $${paramCount + 1}`;

    params.push(limit);

    const result = await pool.query(sqlQuery, params);
    
    // Получаем товары для каждой закупки
    const procurementsWithProducts = await Promise.all(
      result.rows.map(async (procurement) => {
        try {
          const productsResult = await pool.query(`
            SELECT 
              pi.quantity as required_quantity,
              pi.unit_price,
              p.product_id,
              p.name as product_name,
              p.description as product_description,
              p.average_price as market_price,
              c.name as category_name
            FROM procurement_items pi
            JOIN products p ON pi.product_id = p.product_id
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE pi.procurement_id = $1
            LIMIT 5
          `, [procurement.id]);

          return {
            ...procurement,
            products: productsResult.rows,
            participants_count: 0,
            search_score: procurement.rank,
            match_type: procurement.rank > 0.1 ? 'high' : 'medium'
          };
        } catch (error) {
          console.error(`Error loading products for procurement ${procurement.id}:`, error);
          return {
            ...procurement,
            products: [],
            participants_count: 0,
            search_score: procurement.rank,
            match_type: procurement.rank > 0.1 ? 'high' : 'medium'
          };
        }
      })
    );

    return procurementsWithProducts;

  } catch (error) {
    console.error('Procurement search error:', error);
    return [];
  }
}

// Поиск категорий
async function searchCategories(query, limit) {
  try {
    const result = await pool.query(`
      SELECT 
        category_id,
        name,
        description,
        level,
        ts_rank(to_tsvector('russian', 
          COALESCE(name, '') || ' ' || 
          COALESCE(description, '')
        ), plainto_tsquery('russian', $1)) as rank
      FROM categories
      WHERE to_tsvector('russian', 
        COALESCE(name, '') || ' ' || 
        COALESCE(description, '')
      ) @@ plainto_tsquery('russian', $1)
         OR name ILIKE $2
      ORDER BY rank DESC, level
      LIMIT $3
    `, [query, `%${query}%`, limit]);

    return result.rows;

  } catch (error) {
    console.error('Category search error:', error);
    return [];
  }
}

// Генерация поисковых подсказок
async function generateSearchSuggestions(query, results) {
  const suggestions = {
    alternative_queries: [],
    related_categories: [],
    popular_searches: [],
    filters: []
  };

  // Альтернативные запросы на основе результатов
  if (results.products && results.products.length > 0) {
    const categories = [...new Set(results.products.map(p => p.category_name).filter(Boolean))];
    suggestions.related_categories = categories.slice(0, 3);
    
    // Генерируем альтернативные запросы
    if (categories.length > 0) {
      suggestions.alternative_queries.push(
        `${query} ${categories[0]}`,
        `купить ${query}`,
        `${query} оптом`
      );
    }

    // Предлагаем фильтры по цене
    const prices = results.products.map(p => p.price_per_item).filter(p => p > 0);
    if (prices.length > 0) {
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      suggestions.filters.push({
        type: 'price',
        label: `до ${Math.round(avgPrice)} руб`,
        value: `price:${Math.round(avgPrice)}`
      });
    }
  }

  // Популярные поисковые запросы
  suggestions.popular_searches = [
    'офисная бумага а4',
    'компьютерная техника',
    'хозяйственные товары',
    'канцелярия для офиса',
    'строительные материалы'
  ];

  return suggestions;
}

// =============================================
// API ENDPOINTS - ПОИСК
// =============================================

// Умный поиск по всей базе данных
app.get('/api/search/smart', async (req, res) => {
  try {
    const { q: query, limit = 50, type } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Поисковый запрос должен содержать минимум 2 символа' 
      });
    }

    const searchQuery = query.trim();
    
    console.log('Smart search request:', { query: searchQuery, limit, type });

    // Анализируем запрос для определения типа поиска
    const searchAnalysis = analyzeSearchQuery(searchQuery);
    
    let results = {};

    // Поиск товаров
    if (!type || type === 'products') {
      results.products = await searchProducts(searchQuery, parseInt(limit), searchAnalysis);
    }

    // Поиск закупок
    if (!type || type === 'procurements') {
      results.procurements = await searchProcurements(searchQuery, parseInt(limit), searchAnalysis);
    }

    // Поиск категорий
    if (!type || type === 'categories') {
      results.categories = await searchCategories(searchQuery, 5);
    }

    // Дополнительные подсказки и анализ
    results.analysis = searchAnalysis;
    results.suggestions = await generateSearchSuggestions(searchQuery, results);

    res.json({
      query: searchQuery,
      results,
      total_count: (results.products?.length || 0) + 
                   (results.procurements?.length || 0) +
                   (results.categories?.length || 0),
      search_time: new Date().toISOString()
    });

  } catch (error) {
    console.error('Smart search error:', error);
    res.status(500).json({ 
      error: 'Ошибка при выполнении поиска',
      details: error.message 
    });
  }
});

// Быстрый поиск для автодополнения
app.get('/api/search/autocomplete', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const result = await pool.query(`
      SELECT 
        'product' as type,
        name as title,
        product_id as id,
        category_name,
        average_price as price
      FROM products 
      WHERE (name ILIKE $1 OR manufacturer ILIKE $1) 
        AND is_available = true
      UNION ALL
      SELECT 
        'procurement' as type,
        name as title,
        procurement_id as id,
        'Закупка' as category_name,
        estimated_price as price
      FROM procurements 
      WHERE name ILIKE $1
      UNION ALL
      SELECT 
        'category' as type,
        name as title,
        category_id as id,
        'Категория' as category_name,
        NULL as price
      FROM categories 
      WHERE name ILIKE $1
      ORDER BY 
        CASE 
          WHEN type = 'category' THEN 1
          WHEN type = 'product' THEN 2
          ELSE 3 
        END,
        title
      LIMIT $2
    `, [`%${query}%`, parseInt(limit)]);

    res.json({ suggestions: result.rows });

  } catch (error) {
    console.error('Autocomplete error:', error);
    res.json({ suggestions: [] });
  }
});

// Популярные поисковые запросы
app.get('/api/search/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // В реальной системе здесь была бы таблица с историей поиска
    const popularSearches = [
      'ручка гелевая',
      'бумага а4',
      'принтер лазерный',
      'компьютер офисный',
      'стол офисный',
      'кресло компьютерное',
      'сканер документов',
      'шкаф для документов',
      'картридж для принтера',
      'монитор 24 дюйма'
    ];

    res.json({ 
      popular_searches: popularSearches.slice(0, parseInt(limit)),
      updated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Popular searches error:', error);
    res.json({ popular_searches: [] });
  }
});

// Поисковые подсказки при вводе
app.get('/api/search/suggestions', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const analysis = analyzeSearchQuery(query);
    const suggestions = [];

    // Подсказки по категориям
    if (analysis.likely_categories.length > 0) {
      suggestions.push(...analysis.likely_categories.map(cat => ({
        type: 'category',
        text: `Категория: ${cat}`,
        query: `${query} ${cat}`
      })));
    }

    // Подсказки по брендам
    if (analysis.is_brand) {
      suggestions.push({
        type: 'brand',
        text: 'Искать по брендам',
        query: query
      });
    }

    // Подсказки по цене
    if (!analysis.price_range) {
      suggestions.push({
        type: 'price',
        text: 'Добавить фильтр по цене',
        query: `${query} до 10000 руб`
      });
    }

    res.json({ suggestions });

  } catch (error) {
    console.error('Search suggestions error:', error);
    res.json({ suggestions: [] });
  }
});

// =============================================
// API ENDPOINTS - АУТЕНТИФИКАЦИЯ
// =============================================

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Register request body:', req.body);
    
    const { name, email, password, INN, company_name, phone_number } = req.body;

    if (!name || !email || !password || !INN) {
      return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    // Проверка существующего пользователя
    const userExists = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, 10);

    // Создание пользователя
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, inn, company_name, full_name, phone_number) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING user_id, email, inn, company_name, full_name as name, phone_number, created_at`,
      [email, passwordHash, INN, company_name, name, phone_number]
    );

    const user = result.rows[0];
    const sessionId = generateSessionId();
    sessions.set(sessionId, { userId: user.user_id, email: user.email });

    console.log('User registered:', { userId: user.user_id, email: user.email });

    res.json({
      message: 'Пользователь успешно зарегистрирован',
      user: user,
      sessionId
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

// Авторизация
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login request body:', req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Поиск пользователя
    const result = await pool.query(
      'SELECT user_id, email, password_hash, full_name as name, company_name, inn, phone_number FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    const user = result.rows[0];

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }

    // Создание сессии
    const sessionId = generateSessionId();
    sessions.set(sessionId, { userId: user.user_id, email: user.email });

    console.log('User logged in:', { userId: user.user_id, email: user.email });

    res.json({
      message: 'Успешный вход',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        company_name: user.company_name,
        INN: user.inn,
        phone_number: user.phone_number
      },
      sessionId
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка при авторизации' });
  }
});

// Выход
app.post('/api/auth/logout', checkSession, (req, res) => {
  const sessionId = req.headers['session-id'];
  sessions.delete(sessionId);
  console.log('User logged out:', { sessionId });
  res.json({ message: 'Успешный выход' });
});

// =============================================
// API ENDPOINTS - ПОЛЬЗОВАТЕЛЬ
// =============================================

// Получить профиль пользователя
app.get('/api/user/profile', checkSession, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, email, inn, company_name, full_name as name, phone_number, created_at FROM users WHERE user_id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Ошибка при получении профиля' });
  }
});

// Обновить профиль пользователя
app.put('/api/user/profile', checkSession, async (req, res) => {
  try {
    const { name, email, company_name, phone_number } = req.body;
    
    const result = await pool.query(
      `UPDATE users 
       SET full_name = $1, email = $2, company_name = $3, phone_number = $4, updated_at = NOW()
       WHERE user_id = $5
       RETURNING user_id, email, inn, company_name, full_name as name, phone_number, created_at`,
      [name, email, company_name, phone_number, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Обновляем данные в сессии
    const sessionId = req.headers['session-id'];
    if (sessions.has(sessionId)) {
      sessions.set(sessionId, { ...sessions.get(sessionId), ...result.rows[0] });
    }
    
    res.json({ user: result.rows[0], message: 'Профиль успешно обновлен' });
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Email уже используется' });
    }
    
    res.status(500).json({ error: 'Ошибка при обновлении профиля' });
  }
});

// Получить закупки пользователя
app.get('/api/user/my-procurements', checkSession, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.procurement_id as id,
        p.name as title,
        p.status,
        p.estimated_price as current_price,
        p.organization_name as customer_name,
        p.organization_inn as customer_inn,
        p.procurement_date,
        p.created_at,
        COUNT(pi.procurement_item_id) as products_count
       FROM procurements p
       LEFT JOIN procurement_items pi ON p.procurement_id = pi.procurement_id
       WHERE p.user_id = $1
       GROUP BY p.procurement_id, p.name, p.status, p.estimated_price, 
                p.organization_name, p.organization_inn, p.procurement_date, p.created_at
       ORDER BY p.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('My procurements for user:', req.user.userId, 'count:', result.rows.length);
    
    res.json({ procurements: result.rows });
  } catch (error) {
    console.error('Get my procurements error:', error);
    res.status(500).json({ error: 'Ошибка при получении закупок' });
  }
});

// Получить участия пользователя в закупках
app.get('/api/user/my-participations', checkSession, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        pp.procurement_id,
        pp.proposed_price,
        pp.status,
        pp.created_at,
        p.name as procurement_title,
        p.organization_name as customer_name,
        p.organization_inn as customer_inn
       FROM procurement_participants pp
       JOIN procurements p ON pp.procurement_id = p.procurement_id
       WHERE pp.user_id = $1
       ORDER BY pp.created_at DESC`,
      [req.user.userId]
    );
    
    res.json({ participations: result.rows });
  } catch (error) {
    console.error('Get my participations error:', error);
    res.status(500).json({ error: 'Ошибка при получении участий' });
  }
});

// =============================================
// API ENDPOINTS - ИЗБРАННОЕ
// =============================================

// Получить избранное пользователя
app.get('/api/user/favorites', checkSession, async (req, res) => {
  try {
    const { type } = req.query; // 'products', 'procurements', или все
    
    let query = `
      SELECT 
        f.favorite_id as id,
        f.favorite_type as type,
        f.created_at,
        p.product_id,
        p.name as product_name,
        p.description as product_description,
        p.manufacturer as product_company,
        p.average_price as product_price,
        p.unit_of_measure,
        c.name as category_name,
        pr.procurement_id,
        pr.name as procurement_title,
        pr.estimated_price as procurement_price,
        pr.status as procurement_status,
        pr.organization_name as customer_name
      FROM user_favorites f
      LEFT JOIN products p ON f.product_id = p.product_id AND f.favorite_type = 'product'
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN procurements pr ON f.procurement_id = pr.procurement_id AND f.favorite_type = 'procurement'
      WHERE f.user_id = $1
    `;
    
    const params = [req.user.userId];
    
    if (type === 'products') {
      query += ` AND f.favorite_type = 'product'`;
    } else if (type === 'procurements') {
      query += ` AND f.favorite_type = 'procurement'`;
    }
    
    query += ` ORDER BY f.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Форматируем ответ
    const favorites = result.rows.map(row => {
      if (row.favorite_type === 'product') {
        return {
          id: row.id,
          type: 'product',
          product: {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            company: row.product_company,
            price_per_item: row.product_price,
            category_name: row.category_name,
            unit_of_measure: row.unit_of_measure
          },
          created_at: row.created_at
        };
      } else {
        return {
          id: row.id,
          type: 'procurement',
          procurement: {
            id: row.procurement_id,
            title: row.procurement_title,
            current_price: row.procurement_price,
            status: row.procurement_status,
            customer_name: row.customer_name
          },
          created_at: row.created_at
        };
      }
    });
    
    res.json({ favorites });
    
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Ошибка при получении избранного' });
  }
});

// Добавить в избранное
app.post('/api/user/favorites', checkSession, async (req, res) => {
  try {
    const { product_id, procurement_id } = req.body;
    
    if (!product_id && !procurement_id) {
      return res.status(400).json({ error: 'Укажите product_id или procurement_id' });
    }
    
    const favorite_type = product_id ? 'product' : 'procurement';
    
    // Проверяем, не добавлено ли уже в избранное
    const existing = await pool.query(
      `SELECT favorite_id FROM user_favorites 
       WHERE user_id = $1 AND product_id = $2 AND procurement_id = $3`,
      [req.user.userId, product_id || null, procurement_id || null]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Уже в избранном' });
    }
    
    const result = await pool.query(
      `INSERT INTO user_favorites (user_id, product_id, procurement_id, favorite_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.userId, product_id || null, procurement_id || null, favorite_type]
    );
    
    res.json({ 
      message: 'Добавлено в избранное',
      favorite: result.rows[0]
    });
    
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Ошибка при добавлении в избранное' });
  }
});

// Удалить из избранного
app.delete('/api/user/favorites/:id', checkSession, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM user_favorites WHERE favorite_id = $1 AND user_id = $2 RETURNING favorite_id',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Не найдено в избранном' });
    }
    
    res.json({ message: 'Удалено из избранного' });
    
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Ошибка при удалении из избранного' });
  }
});

// Проверить, в избранном ли элемент
app.get('/api/user/favorites/check', checkSession, async (req, res) => {
  try {
    const { product_id, procurement_id } = req.query;
    
    const result = await pool.query(
      `SELECT favorite_id FROM user_favorites 
       WHERE user_id = $1 AND product_id = $2 AND procurement_id = $3`,
      [req.user.userId, product_id || null, procurement_id || null]
    );
    
    res.json({ 
      is_favorite: result.rows.length > 0,
      favorite_id: result.rows[0]?.favorite_id
    });
    
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Ошибка при проверке избранного' });
  }
});

// =============================================
// API ENDPOINTS - ТОВАРЫ И ЗАКУПКИ
// =============================================

// Получение категорий
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category_id, name, parent_category_id, level, description
      FROM categories 
      ORDER BY level, parent_category_id NULLS FIRST, name
    `);
    
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Ошибка при получении категорий' });
  }
});

// Получение товаров
app.get('/api/products', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, limit = 1000 } = req.query;
    
    console.log('Products request query:', { category, minPrice, maxPrice, search, limit });
    
    let query = `
      SELECT 
        p.product_id as id,
        p.name,
        p.description,
        p.manufacturer as company,
        p.average_price as price_per_item,
        p.unit_of_measure,
        p.specifications,
        p.is_available,
        c.name as category_name,
        c.category_id
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_available = true
    `;
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND (c.name ILIKE $${paramCount})`;
      params.push(`%${category}%`);
    }

    if (minPrice) {
      paramCount++;
      query += ` AND p.average_price >= $${paramCount}`;
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      paramCount++;
      query += ` AND p.average_price <= $${paramCount}`;
      params.push(parseFloat(maxPrice));
    }

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.manufacturer ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (paramCount + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    // Преобразуем данные для фронтенда
    const products = result.rows.map(row => ({
      ...row,
      amount: 10, // дефолтное значение
      category_name: row.category_name || 'Без категории'
    }));
    
    console.log(`Found ${products.length} products`);
    
    res.json({
      products: products,
      total: products.length
    });

  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Ошибка при получении товаров' });
  }
});

// Получение закупок
app.get('/api/procurements', async (req, res) => {
  try {
    const { status, limit = 500 } = req.query;
    
    console.log('Procurements request query:', { status, limit });
    
    let query = `
      SELECT 
        p.procurement_id as id,
        p.name as title,
        p.estimated_price as current_price,
        p.actual_price,
        p.status,
        p.procurement_date,
        p.publication_date,
        p.organization_name as customer_name,
        p.organization_inn as customer_inn,
        p.created_at
      FROM procurements p
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (paramCount + 1);
    params.push(parseInt(limit));

    console.log('Executing procurements query:', query, params);
    
    const result = await pool.query(query, params);
    
    // Получаем товары для каждой закупки
    const procurementsWithProducts = await Promise.all(
      result.rows.map(async (procurement) => {
        try {
          const productsResult = await pool.query(`
            SELECT 
              pi.quantity as required_quantity,
              pi.unit_price,
              p.product_id,
              p.name as product_name,
              p.description as product_description,
              p.average_price as market_price,
              c.name as category_name
            FROM procurement_items pi
            JOIN products p ON pi.product_id = p.product_id
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE pi.procurement_id = $1
          `, [procurement.id]);

          const participants_count = 0;

          return {
            ...procurement,
            products: productsResult.rows,
            participants_count: participants_count,
            description: procurement.name,
            procurement_date: procurement.procurement_date ? 
              new Date(procurement.procurement_date).toISOString() : null,
            publication_date: procurement.publication_date ? 
              new Date(procurement.publication_date).toISOString() : null
          };
        } catch (error) {
          console.error(`Error loading products for procurement ${procurement.id}:`, error);
          return {
            ...procurement,
            products: [],
            participants_count: 0,
            description: procurement.name,
            procurement_date: procurement.procurement_date ? 
              new Date(procurement.procurement_date).toISOString() : null,
            publication_date: procurement.publication_date ? 
              new Date(procurement.publication_date).toISOString() : null
          };
        }
      })
    );

    console.log(`Found ${procurementsWithProducts.length} procurements`);
    
    res.json({
      procurements: procurementsWithProducts,
      total: procurementsWithProducts.length
    });

  } catch (error) {
    console.error('Procurements GET error:', error);
    res.status(500).json({ 
      error: 'Ошибка при получении закупок',
      details: error.message 
    });
  }
});

// Создание закупки
app.post('/api/procurements', checkSession, async (req, res) => {
  let client;
  try {
    console.log('Create procurement request body:', req.body);
    console.log('User creating procurement:', req.user);

    const {
      title,
      description,
      customer_name,
      customer_inn,
      current_price,
      products = []
    } = req.body;

    if (!title || !current_price) {
      return res.status(400).json({ 
        error: 'Заполните все обязательные поля: название и цена',
        details: { title: !!title, current_price: !!current_price }
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const procurementId = `PROC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('Creating procurement with ID:', procurementId);

    const procurementResult = await client.query(
      `INSERT INTO procurements 
       (procurement_id, user_id, name, estimated_price, status, procurement_date, organization_name, organization_inn)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        procurementId,
        req.user.userId,
        title,
        parseFloat(current_price),
        'active',
        new Date(),
        customer_name || 'Не указано',
        customer_inn || '0000000000'
      ]
    );

    const procurement = procurementResult.rows[0];
    console.log('Procurement created successfully:', procurement);

    if (products && products.length > 0) {
      console.log('Adding products to procurement:', products.length);
      
      for (const product of products) {
        if (product.product_id && product.required_quantity > 0) {
          console.log('Adding product:', product.product_id, 'quantity:', product.required_quantity);
          
          await client.query(
            `INSERT INTO procurement_items 
             (procurement_id, product_id, quantity, unit_price)
             VALUES ($1, $2, $3, $4)`,
            [
              procurementId,
              product.product_id,
              product.required_quantity,
              product.max_price || product.price_per_item || 0
            ]
          );
        }
      }
    } else {
      console.log('No products to add to procurement');
    }

    await client.query('COMMIT');

    const fullProcurementResult = await pool.query(
      `SELECT p.*
       FROM procurements p
       WHERE p.procurement_id = $1`,
      [procurementId]
    );

    const productsResult = await pool.query(
      `SELECT pi.*, p.name as product_name, p.average_price as market_price
       FROM procurement_items pi
       JOIN products p ON pi.product_id = p.product_id
       WHERE pi.procurement_id = $1`,
      [procurementId]
    );

    const procurementWithProducts = {
      ...fullProcurementResult.rows[0],
      products: productsResult.rows,
      participants_count: 0,
      title: fullProcurementResult.rows[0].name,
      description: fullProcurementResult.rows[0].name
    };

    console.log('Final procurement data prepared');

    res.json({ 
      message: 'Закупка успешно создана',
      procurement: procurementWithProducts 
    });

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    
    console.error('Create procurement error:', error);
    res.status(500).json({ 
      error: 'Ошибка при создании закупки',
      details: error.message 
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// =============================================
// API ENDPOINTS - ЧЕРНОВИКИ
// =============================================

// Получить черновики пользователя
app.get('/api/user/my-drafts', checkSession, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        draft_id as id,
        title,
        description,
        customer_name,
        customer_inn,
        estimated_price as current_price,
        law_type,
        location,
        start_date,
        end_date,
        products_data,
        step,
        created_at,
        updated_at
       FROM procurement_drafts 
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user.userId]
    );
    
    console.log('My drafts for user:', req.user.userId, 'count:', result.rows.length);
    
    res.json({ drafts: result.rows });
  } catch (error) {
    console.error('Get my drafts error:', error);
    res.status(500).json({ error: 'Ошибка при получении черновиков' });
  }
});

// Сохранить черновик
app.post('/api/procurement-drafts', checkSession, async (req, res) => {
  try {
    console.log('Save draft request body:', req.body);
    
    const {
      title,
      description,
      customer_name,
      customer_inn,
      current_price,
      law_type = '44-ФЗ',
      contract_terms,
      location,
      start_date,
      end_date,
      products = [],
      step = 1
    } = req.body;

    const productsData = products.map(product => ({
      product_id: product.id || product.product_id,
      name: product.name,
      category_name: product.category_name,
      price_per_item: product.price_per_item,
      quantity: product.quantity,
      total_price: product.price_per_item * product.quantity
    }));

    const result = await pool.query(
      `INSERT INTO procurement_drafts 
       (user_id, title, description, customer_name, customer_inn, 
        estimated_price, law_type, contract_terms, location, 
        start_date, end_date, products_data, step)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.user.userId,
        title || 'Новый черновик',
        description,
        customer_name,
        customer_inn,
        parseFloat(current_price) || 0,
        law_type,
        contract_terms,
        location,
        start_date,
        end_date,
        JSON.stringify(productsData),
        step
      ]
    );

    const draft = result.rows[0];
    
    console.log('Draft saved:', draft.draft_id);
    
    res.json({ 
      message: 'Черновик успешно сохранен',
      draft: draft
    });

  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении черновика' });
  }
});

// Обновить черновик
app.put('/api/procurement-drafts/:id', checkSession, async (req, res) => {
  try {
    const { id } = req.params;
    
    const {
      title,
      description,
      customer_name,
      customer_inn,
      current_price,
      law_type,
      contract_terms,
      location,
      start_date,
      end_date,
      products = [],
      step
    } = req.body;

    const ownershipCheck = await pool.query(
      'SELECT draft_id FROM procurement_drafts WHERE draft_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Черновик не найден' });
    }

    const productsData = products.map(product => ({
      product_id: product.id || product.product_id,
      name: product.name,
      category_name: product.category_name,
      price_per_item: product.price_per_item,
      quantity: product.quantity,
      total_price: product.price_per_item * product.quantity
    }));

    const result = await pool.query(
      `UPDATE procurement_drafts 
       SET title = $1, description = $2, customer_name = $3, customer_inn = $4,
           estimated_price = $5, law_type = $6, contract_terms = $7, location = $8,
           start_date = $9, end_date = $10, products_data = $11, step = $12,
           updated_at = NOW()
       WHERE draft_id = $13
       RETURNING *`,
      [
        title,
        description,
        customer_name,
        customer_inn,
        parseFloat(current_price) || 0,
        law_type,
        contract_terms,
        location,
        start_date,
        end_date,
        JSON.stringify(productsData),
        step,
        id
      ]
    );

    res.json({ 
      message: 'Черновик успешно обновлен',
      draft: result.rows[0]
    });

  } catch (error) {
    console.error('Update draft error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении черновика' });
  }
});

// Удалить черновик
app.delete('/api/procurement-drafts/:id', checkSession, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM procurement_drafts WHERE draft_id = $1 AND user_id = $2 RETURNING draft_id',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Черновик не найден' });
    }

    res.json({ message: 'Черновик успешно удален' });

  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: 'Ошибка при удалении черновика' });
  }
});

// Загрузить черновик для редактирования
app.get('/api/procurement-drafts/:id', checkSession, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM procurement_drafts 
       WHERE draft_id = $1 AND user_id = $2`,
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Черновик не найден' });
    }

    res.json({ draft: result.rows[0] });

  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке черновика' });
  }
});

// =============================================
// API ENDPOINTS - ML И РЕКОМЕНДАЦИИ
// =============================================

// Прокси для ML сервиса
app.get("/api/ml/health", async (req, res) => {
  try {
    const r = await fetch("http://127.0.0.1:8000/health");
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("ML health error:", err);
    res.status(500).json({ error: "ML service unreachable" });
  }
});

app.post("/api/ml/recommendations", async (req, res) => {
  try {
    const r = await fetch("http://127.0.0.1:8000/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error("ML recommend error:", err);
    res.status(500).json({ error: "ML service unreachable" });
  }
});

// =============================================
// СЛУЖЕБНЫЕ ENDPOINTS
// =============================================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      status: 'OK', 
      database: 'pc_db',
      time: result.rows[0].time,
      sessions: sessions.size,
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Статистика системы
app.get('/api/stats', async (req, res) => {
  try {
    const [
      productsCount,
      procurementsCount,
      usersCount,
      categoriesCount
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products WHERE is_available = true'),
      pool.query('SELECT COUNT(*) as count FROM procurements'),
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM categories')
    ]);

    res.json({
      products: parseInt(productsCount.rows[0].count),
      procurements: parseInt(procurementsCount.rows[0].count),
      users: parseInt(usersCount.rows[0].count),
      categories: parseInt(categoriesCount.rows[0].count),
      sessions: sessions.size,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
  }
});

// =============================================
// ОБРАБОТКА ОШИБОК И ЗАПУСК
// =============================================

// Обработка 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API маршрут не найден' });
});

// Глобальный обработчик ошибок
app.use(errorHandler);

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`База данных: pc_db`);
  console.log(`Пользователь БД: store_app1`);
  console.log(`API доступно: http://localhost:${PORT}/api`);
  console.log(`Умный поиск: /api/search/smart`);
  console.log(`Health check: /api/health`);
});

export default app;