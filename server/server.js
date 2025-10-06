import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import pkg from 'pg';

const { Pool } = pkg;
const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: 'store_app1',
  host: 'localhost',
  database: 'online_store1',
  password: '1234',
  port: 5432,
});

// Простое хранилище сессий
const sessions = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

// Auth middleware
const checkSession = (req, res, next) => {
  const sessionId = req.headers['session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  req.user = sessions.get(sessionId);
  next();
};

// Routes

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      status: 'OK', 
      database: 'online_store1',
      time: result.rows[0].time 
    });
  } catch (error) {
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, INN, company_name, location, phone_number } = req.body;

    if (!name || !email || !password || !INN) {
      return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    // Проверка существующего пользователя
    const userExists = await pool.query('SELECT id FROM store.users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, 10);

    // Создание пользователя
    const result = await pool.query(
      `INSERT INTO store.users (name, email, password_hash, INN, company_name, location, phone_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, email, INN, company_name, location, phone_number, role`,
      [name, email, passwordHash, INN, company_name, location, phone_number]
    );

    const user = result.rows[0];
    const sessionId = generateSessionId();
    sessions.set(sessionId, { userId: user.id, email: user.email, role: user.role });

    res.status(201).json({
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Поиск пользователя
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, is_active FROM store.users WHERE email = $1',
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
    sessions.set(sessionId, { userId: user.id, email: user.email, role: user.role });

    res.json({
      message: 'Успешный вход',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      sessionId
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка при авторизации' });
  }
});

// Получение категорий
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, parent_id, level, description
      FROM store.categories 
      WHERE is_active = true
      ORDER BY level, parent_id NULLS FIRST, sort_order
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
    
    let query = `
      SELECT 
        p.*, 
        c.name as category_name,
        c2.name as parent_category_name
      FROM store.products p 
      LEFT JOIN store.categories c ON p.category_id = c.id
      LEFT JOIN store.categories c2 ON c.parent_id = c2.id
      WHERE p.is_active = true
    `;
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND (c.name ILIKE $${paramCount} OR c2.name ILIKE $${paramCount})`;
      params.push(`%${category}%`);
    }

    if (minPrice) {
      paramCount++;
      query += ` AND p.price_per_item >= $${paramCount}`;
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      paramCount++;
      query += ` AND p.price_per_item <= $${paramCount}`;
      params.push(parseFloat(maxPrice));
    }

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.company ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (paramCount + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    res.json({
      products: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Ошибка при получении товаров' });
  }
});

// Получение закупок
app.get('/api/procurements', async (req, res) => {
  try {
    const { status, limit = 20 } = req.query;
    
    let query = `
      SELECT 
        p.*,
        u.name as created_by_name,
        u.company_name as created_by_company
      FROM store.procurements p
      LEFT JOIN store.users u ON p.created_by = u.id
      WHERE p.is_active = true
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY p.start_date DESC LIMIT $' + (paramCount + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    // Получаем товары для каждой закупки
    const procurementsWithProducts = await Promise.all(
      result.rows.map(async (procurement) => {
        const productsResult = await pool.query(`
          SELECT 
            pp.*,
            p.name as product_name,
            p.price_per_item as market_price,
            p.description as product_description,
            c.name as category_name
          FROM store.procurement_products pp
          JOIN store.products p ON pp.product_id = p.id
          JOIN store.categories c ON p.category_id = c.id
          WHERE pp.procurement_id = $1
        `, [procurement.id]);

        const participantsResult = await pool.query(`
          SELECT COUNT(*) as participants_count 
          FROM store.procurement_participants 
          WHERE procurement_id = $1
        `, [procurement.id]);

        return {
          ...procurement,
          products: productsResult.rows,
          participants_count: parseInt(participantsResult.rows[0].participants_count)
        };
      })
    );

    res.json({
      procurements: procurementsWithProducts,
      total: procurementsWithProducts.length
    });

  } catch (error) {
    console.error('Procurements error:', error);
    res.status(500).json({ error: 'Ошибка при получении закупок' });
  }
});

// Участие в закупке
app.post('/api/procurements/:id/participate', checkSession, async (req, res) => {
  try {
    const { id } = req.params;
    const { proposed_price, proposal_text } = req.body;
    const userId = req.user.userId;

    // Проверяем существование закупки
    const procurementResult = await pool.query(
      'SELECT * FROM store.procurements WHERE id = $1 AND is_active = true',
      [id]
    );

    if (procurementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Закупка не найдена' });
    }

    // Проверяем, не участвует ли уже пользователь
    const existingParticipation = await pool.query(
      'SELECT id FROM store.procurement_participants WHERE procurement_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingParticipation.rows.length > 0) {
      return res.status(400).json({ error: 'Вы уже участвуете в этой закупке' });
    }

    // Добавляем участника
    await pool.query(
      `INSERT INTO store.procurement_participants 
       (procurement_id, user_id, proposed_price, proposal_text, status) 
       VALUES ($1, $2, $3, $4, 'pending')`,
      [id, userId, proposed_price, proposal_text]
    );

    res.json({ message: 'Заявка на участие отправлена' });

  } catch (error) {
    console.error('Participation error:', error);
    res.status(500).json({ error: 'Ошибка при отправке заявки' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`База данных: online_store1`);
  console.log(`Пользователь БД: store_app1`);
  console.log(`API доступно: http://localhost:${PORT}/api`);
});