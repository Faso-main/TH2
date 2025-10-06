import express from 'express';
import cors from 'cors';
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

// Get categories tree
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
    res.status(500).json({ error: 'Error fetching categories' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`База данных: online_store1`);
  console.log(`Пользователь БД: store_app1`);
  console.log(`Проверка: http://localhost:${PORT}/api/health`);
});