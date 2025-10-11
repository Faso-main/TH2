-- =============================================
-- СТРУКТУРА БАЗЫ ДАННЫХ PC_DB
-- =============================================

-- 📊 ОБЩАЯ СТАТИСТИКА:
-- Товары: 1,119,111 записей
-- Закупки: 80,542 записей  
-- Позиции закупок: 341,137 записей
-- Категории: 9 записей
-- Шаблоны: 9 записей
-- Товары в шаблонах: 120 записей
-- Пользователи: 1 запись

-- =============================================
-- ОСНОВНЫЕ ТАБЛИЦЫ И СХЕМА
-- =============================================

-- 👥 ПОЛЬЗОВАТЕЛИ
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    inn VARCHAR(20),
    company_name VARCHAR(500),
    full_name VARCHAR(255),
    phone_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 📂 КАТЕГОРИИ ТОВАРОВ
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_category_id UUID REFERENCES categories(category_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    keywords TEXT[],  -- Массив ключевых слов для поиска
    level INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🏷️ ТОВАРЫ
CREATE TABLE products (
    product_id VARCHAR(100) PRIMARY KEY,  -- ID из внешней системы
    name VARCHAR(1000) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(category_id),
    manufacturer VARCHAR(500),
    unit_of_measure VARCHAR(50),  -- единица измерения (шт, уп и т.д.)
    specifications JSONB,  -- технические характеристики в JSON
    average_price DECIMAL(15,2),  -- средняя цена
    is_available BOOLEAN DEFAULT true,
    source_system VARCHAR(100),  -- источник данных
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 📋 ЗАКУПКИ
CREATE TABLE procurements (
    procurement_id VARCHAR(100) PRIMARY KEY,  -- ID закупки
    user_id UUID REFERENCES users(user_id),
    name VARCHAR(1000),  -- название закупки
    estimated_price DECIMAL(15,2),  -- ориентировочная цена
    actual_price DECIMAL(15,2),  -- фактическая цена
    status VARCHAR(50) DEFAULT 'completed',
    procurement_date DATE,  -- дата закупки
    publication_date TIMESTAMP,  -- дата публикации
    organization_name VARCHAR(500),  -- организация
    organization_inn VARCHAR(20),  -- ИНН организации
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🛒 ПОЗИЦИИ В ЗАКУПКАХ
CREATE TABLE procurement_items (
    procurement_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procurement_id VARCHAR(100) REFERENCES procurements(procurement_id),
    product_id VARCHAR(100) REFERENCES products(product_id),
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(15,2),  -- цена за единицу
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 📝 ШАБЛОНЫ ЗАКУПОК
CREATE TABLE procurement_templates (
    template_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    size_range VARCHAR(100),  -- размер закупки (малая, средняя, крупная)
    keywords TEXT[],  -- ключевые слова для поиска
    sample_size INTEGER DEFAULT 0,  -- размер выборки
    avg_products_count DECIMAL(10,2),  -- среднее количество товаров
    avg_price DECIMAL(15,2),  -- средняя цена
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🏷️ ТОВАРЫ В ШАБЛОНАХ
CREATE TABLE template_products (
    template_id VARCHAR(100) REFERENCES procurement_templates(template_id),
    product_id VARCHAR(100) REFERENCES products(product_id),
    frequency INTEGER DEFAULT 0,  -- частота встречаемости
    position INTEGER DEFAULT 0,  -- позиция в шаблоне
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (template_id, product_id)
);

-- 💡 РЕКОМЕНДАЦИИ
CREATE TABLE recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    product_id VARCHAR(100) REFERENCES products(product_id),
    score DECIMAL(5,4) NOT NULL,  -- оценка релевантности (0-1)
    recommendation_type VARCHAR(50),  -- тип рекомендации
    reason TEXT,  -- обоснование рекомендации
    context JSONB,  -- контекст рекомендации
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- =============================================

-- Индексы для пользователей
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_inn ON users(inn);

-- Индексы для категорий
CREATE INDEX idx_categories_parent ON categories(parent_category_id);
CREATE INDEX idx_categories_level ON categories(level);
CREATE INDEX idx_categories_name ON categories(name);

-- Индексы для товаров
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_name ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_available ON products(is_available) WHERE is_available = true;
CREATE INDEX idx_products_price ON products(average_price);

-- Индексы для закупок
CREATE INDEX idx_procurements_user ON procurements(user_id);
CREATE INDEX idx_procurements_date ON procurements(procurement_date);
CREATE INDEX idx_procurements_organization ON procurements(organization_name);

-- Индексы для позиций закупок
CREATE INDEX idx_procurement_items_procurement ON procurement_items(procurement_id);
CREATE INDEX idx_procurement_items_product ON procurement_items(product_id);
CREATE INDEX idx_procurement_items_composite ON procurement_items(procurement_id, product_id);

-- Индексы для рекомендаций
CREATE INDEX idx_recommendations_user ON recommendations(user_id);
CREATE INDEX idx_recommendations_score ON recommendations(score DESC);
CREATE INDEX idx_recommendations_user_product ON recommendations(user_id, product_id);

-- Индексы для шаблонов
CREATE INDEX idx_template_products_template ON template_products(template_id);
CREATE INDEX idx_template_products_product ON template_products(product_id);

-- =============================================
-- ПОЛЕЗНЫЕ ЗАПРОСЫ ДЛЯ РАБОТЫ
-- =============================================

-- 🔍 ПОИСК ТОВАРОВ ПО НАЗВАНИЮ
-- SELECT * FROM products 
-- WHERE name ILIKE '%дырокол%' 
-- ORDER BY average_price DESC 
-- LIMIT 10;

-- 📊 СТАТИСТИКА ПО КАТЕГОРИЯМ
-- SELECT c.name, COUNT(p.product_id) as product_count, 
--        AVG(p.average_price) as avg_price
-- FROM categories c 
-- LEFT JOIN products p ON c.category_id = p.category_id 
-- GROUP BY c.category_id, c.name 
-- ORDER BY product_count DESC;

-- 🛒 ИСТОРИЯ ЗАКУПОК ПОЛЬЗОВАТЕЛЯ
-- SELECT p.name, pi.quantity, pi.unit_price, pr.procurement_date
-- FROM procurements pr
-- JOIN procurement_items pi ON pr.procurement_id = pi.procurement_id
-- JOIN products p ON pi.product_id = p.product_id
-- WHERE pr.user_id = '11111111-1111-1111-1111-111111111111'
-- ORDER BY pr.procurement_date DESC;

-- 💡 РЕКОМЕНДАЦИИ ДЛЯ ПОЛЬЗОВАТЕЛЯ
-- SELECT p.*, r.score, r.reason 
-- FROM recommendations r
-- JOIN products p ON r.product_id = p.product_id
-- WHERE r.user_id = '11111111-1111-1111-1111-111111111111'
-- ORDER BY r.score DESC
-- LIMIT 10;

-- 📈 ТОП ТОВАРОВ ПО ЧАСТОТЕ ЗАКУПОК
-- SELECT p.product_id, p.name, COUNT(pi.procurement_id) as purchase_count
-- FROM products p
-- JOIN procurement_items pi ON p.product_id = pi.product_id
-- GROUP BY p.product_id, p.name
-- ORDER BY purchase_count DESC
-- LIMIT 20;

-- =============================================
-- КЛЮЧЕВЫЕ ХАРАКТЕРИСТИКИ ДАННЫХ
-- =============================================

-- ✅ Товары: 1.1M+ записей с ценами, производителями, характеристиками
-- ✅ Закупки: 80K+ исторических закупок с детализацией по товарам
-- ✅ Связи: товары ↔ закупки ↔ пользователи ↔ категории
-- ✅ JSONB: технические характеристики товаров в структурированном виде
-- ✅ Полнотекстовый поиск: по названиям товаров
-- ✅ Рекомендательная система: готова к интеграции ML-моделей

-- =============================================
-- ДАННЫЕ ДЛЯ ПОДКЛЮЧЕНИЯ
-- =============================================

-- База данных: pc_db
-- Пользователь: store_app1
-- Пароль: 1234
-- Хост: localhost
-- Порт: 5432

-- Тестовый пользователь: 
-- user_id: 11111111-1111-1111-1111-111111111111
-- email: admin@company.com