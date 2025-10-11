import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import pkg from 'pg';
import recommendationRoutes from './recommendation_routes.js';



const { Pool } = pkg;
const app = express();
const PORT = 5000;

const corsOptions = {
  origin: [
    'https://www.faso312.ru',
    'https://faso312.ru', 
    'http://localhost:3000',
    'http://127.0.0.1:3000'
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

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Обработка OPTIONS запросов для CORS preflight
app.options('/api/*', cors(corsOptions));

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

// Префикс API
app.use('/api', (req, res, next) => {
  console.log('API request:', req.path);
  next();
});

// PostgreSQL connection - используем базу данных PC_DB
const pool = new Pool({
  user: 'store_app1',
  host: 'localhost',
  database: 'pc_db',
  password: '1234',
  port: 5432,
});

// Простое хранилище сессий
const sessions = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

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

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      status: 'OK', 
      database: 'pc_db',
      time: result.rows[0].time,
      sessions: sessions.size
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Database connection error' });
  }
});

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
    const { category, minPrice, maxPrice, search, limit = 50 } = req.query;
    
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

app.get('/api/procurements', async (req, res) => {
  try {
    const { status, limit = 20 } = req.query;
    
    console.log('Procurements request query:', { status, limit });
    
    // Используем реальные названия столбцов из БД
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
// В server.js в GET /api/procurements добавим обработку дат
const procurementsWithProducts = await Promise.all(
  result.rows.map(async (procurement) => {
    try {
      // Получаем товары для закупки
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

      // Временно устанавливаем participants_count = 0
      const participants_count = 0;

      return {
        ...procurement,
        products: productsResult.rows,
        participants_count: participants_count,
        description: procurement.name, // используем name как description
        // Форматируем даты для фронтенда
        procurement_date: procurement.procurement_date ? 
          new Date(procurement.procurement_date).toISOString() : null,
        publication_date: procurement.publication_date ? 
          new Date(procurement.publication_date).toISOString() : null
      };
    } catch (error) {
      console.error(`Error loading products for procurement ${procurement.id}:`, error);
      // Возвращаем закупку без товаров в случае ошибки
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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      constraint: error.constraint
    });
    
    res.status(500).json({ 
      error: 'Ошибка при получении закупок',
      details: error.message 
    });
  }
});

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

    // Валидация обязательных полей
    if (!title || !current_price) {
      return res.status(400).json({ 
        error: 'Заполните все обязательные поля: название и цена',
        details: { title: !!title, current_price: !!current_price }
      });
    }

    // Начинаем транзакцию
    client = await pool.connect();
    await client.query('BEGIN');

    // Генерация ID закупки
    const procurementId = `PROC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('Creating procurement with ID:', procurementId);

    // Создаем закупку - используем name вместо description
    const procurementResult = await client.query(
      `INSERT INTO procurements 
       (procurement_id, user_id, name, estimated_price, status, procurement_date, organization_name, organization_inn)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        procurementId,
        req.user.userId,
        title, // используем title как name
        parseFloat(current_price),
        'active',
        new Date(),
        customer_name || 'Не указано',
        customer_inn || '0000000000'
      ]
    );

    const procurement = procurementResult.rows[0];
    console.log('Procurement created successfully:', procurement);

    // Добавляем товары в закупку
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

    // Коммитим транзакцию
    await client.query('COMMIT');

    // Получаем полные данные закупки для ответа
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
      title: fullProcurementResult.rows[0].name, // добавляем title для фронтенда
      description: fullProcurementResult.rows[0].name // добавляем description для фронтенда
    };

    console.log('Final procurement data prepared');

    res.json({ 
      message: 'Закупка успешно создана',
      procurement: procurementWithProducts 
    });

  } catch (error) {
    // Откатываем транзакцию в случае ошибки
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    
    console.error('Create procurement error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      constraint: error.constraint
    });
    
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

// Также нужно исправить endpoint участия в закупках
app.post('/api/procurements/:id/participate', checkSession, async (req, res) => {
  try {
    const { id } = req.params;
    const { proposed_price, proposal_text } = req.body;

    // Проверяем существование закупки
    const procurementResult = await pool.query(
      'SELECT * FROM procurements WHERE procurement_id = $1 AND status = $2',
      [id, 'active']
    );

    if (procurementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Закупка не найдена или не активна' });
    }

    // ВРЕМЕННО: возвращаем заглушку, так как таблицы нет
    return res.status(501).json({ 
      error: 'Функционал участия в закупках временно недоступен',
      message: 'Таблица участников закупок находится в разработке'
    });

    // Код ниже будет работать после создания таблицы:
    /*
    await pool.query(
      `INSERT INTO procurement_participants 
       (procurement_id, user_id, proposed_price, proposal_text, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user.userId, proposed_price, proposal_text, 'pending']
    );

    res.json({ message: 'Заявка на участие успешно отправлена' });
    */

  } catch (error) {
    console.error('Participate error:', error);
    res.status(500).json({ error: 'Ошибка при отправке заявки' });
  }
});

// Обработка ошибок
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Обработка 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API маршрут не найден' });
});

app.use('/api/ml', recommendationRoutes);

console.log('✅ ML Recommendation routes registered:');
console.log('   POST /api/ml/recommendations');
console.log('   GET  /api/ml/health');

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`База данных: pc_db`);
  console.log(`Пользователь БД: store_app1`);
  console.log(`API доступно: http://localhost:${PORT}/api`);
});

{/*app.post('/api/ml/recommendations', async (req, res) => {
    try {
        const { user_id, limit = 15 } = req.body;
        
        console.log(`🎯 [ML] Getting recommendations for user: ${user_id}`);
        
        // Прямой вызов Python ML сервиса
        const response = await fetch('http://127.0.0.1:8000/api/recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: user_id,
                limit: parseInt(limit)
            })
        });

        if (!response.ok) {
            throw new Error(`Python service responded with status: ${response.status}`);
        }

        const data = await response.json();
        
        console.log(`✅ [ML] Successfully received ${data.recommendations?.length || 0} recommendations`);
        
        res.json({
            success: true,
            ...data
        });

    } catch (error) {
        console.error('❌ [ML] Recommendation error:', error.message);
        
        // Fallback рекомендации
        const fallbackRecommendations = [
            {
                product_id: "fallback_1",
                product_name: "Офисный стул",
                product_category: "Мебель", 
                total_score: 0.8,
                price_range: { avg: 4500, min: 3500, max: 6000, source: "fallback" },
                explanation: "Популярный товар для офиса",
                in_catalog: true
            },
            {
                product_id: "fallback_2", 
                product_name: "Принтер лазерный", 
                product_category: "Офисная техника",
                total_score: 0.7,
                price_range: { avg: 12000, min: 8000, max: 15000, source: "fallback" },
                explanation: "Необходимая офисная техника", 
                in_catalog: true
            },
            {
                product_id: "fallback_3", 
                product_name: "Канцелярский набор", 
                product_category: "Канцелярия",
                total_score: 0.6,
                price_range: { avg: 1500, min: 800, max: 2500, source: "fallback" },
                explanation: "Базовые канцелярские товары", 
                in_catalog: true
            }
        ].slice(0, req.body.limit || 15);
        
        res.json({
            success: false,
            user_id: req.body.user_id,
            recommendations: fallbackRecommendations,
            count: fallbackRecommendations.length,
            note: 'fallback_recommendations',
            error: error.message
        });
    }
});

app.get('/api/ml/health', async (req, res) => {
    try {
        const response = await fetch('http://127.0.0.1:8000/health', {
            timeout: 5000
        });
        
        if (!response.ok) {
            throw new Error(`Python service health check failed: ${response.status}`);
        }
        
        const data = await response.json();
        res.json({
            python_service: data,
            status: 'healthy'
        });
    } catch (error) {
        console.error('❌ [ML] Health check error:', error.message);
        res.status(503).json({
            python_service: 'unavailable', 
            status: 'unhealthy',
            error: error.message
        });
    }
});

console.log('✅ ML Recommendation endpoints registered:');
console.log('   POST /api/ml/recommendations');
console.log('   GET  /api/ml/health');*/}