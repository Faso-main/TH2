```markdown
# PostgreSQL Product DB (Tree-like) for TenderHack Practice

## Создание базы данных

```bash
CREATE DATABASE online_store 
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0;
```

## Подключение к базе

```bash
sudo -u postgres psql -d online_store
\c online_store
```

## Настройка схемы

```sql
-- Создаем отдельную схему для лучшей организации
CREATE SCHEMA store;

-- Устанавливаем путь поиска для удобства
SET search_path TO store, public;
```

## Структура таблиц

### Таблица категорий (иерархическая)

```sql
CREATE TABLE store.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_id) REFERENCES store.categories(id) ON DELETE SET NULL
);
```

### Таблица товаров

```sql
CREATE TABLE store.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    category_id INTEGER NOT NULL,
    company VARCHAR(255),
    price_per_item DECIMAL(12,2) NOT NULL CHECK (price_per_item >= 0),
    amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    manufacturer VARCHAR(255),
    location VARCHAR(500),
    description TEXT,
    specifications JSONB,
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES store.categories(id) ON DELETE RESTRICT
);
```

### Таблица пользователей

```sql
CREATE TABLE store.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    address JSONB,
    role VARCHAR(50) DEFAULT 'customer',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Управление пользователями и правами

```sql
-- Пользователь для приложения
CREATE USER store_app WITH PASSWORD 'store_app_password_123';

-- Пользователь для чтения (аналитика)
CREATE USER store_reader WITH PASSWORD 'store_reader_password_456';

-- Права на подключение
GRANT CONNECT ON DATABASE online_store TO store_app, store_reader;

-- Права на использование схемы
GRANT USAGE ON SCHEMA store TO store_app, store_reader;

-- Права для приложения (полный доступ)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA store TO store_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store TO store_app;

-- Права для чтения
GRANT SELECT ON ALL TABLES IN SCHEMA store TO store_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA store TO store_reader;

-- Права по умолчанию для будущих таблиц
ALTER DEFAULT PRIVILEGES IN SCHEMA store 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO store_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA store 
    GRANT SELECT ON TABLES TO store_reader;
```

## Индексы

### Для категорий

```sql
CREATE INDEX idx_categories_parent_id ON store.categories(parent_id);
CREATE INDEX idx_categories_active ON store.categories(is_active);
CREATE INDEX idx_categories_sort_order ON store.categories(sort_order);
```

### Для товаров

```sql
CREATE INDEX idx_products_category_id ON store.products(category_id);
CREATE INDEX idx_products_company ON store.products(company);
CREATE INDEX idx_products_price ON store.products(price_per_item);
CREATE INDEX idx_products_active ON store.products(is_active);
CREATE INDEX idx_products_sku ON store.products(sku);
CREATE INDEX idx_products_created_at ON store.products(created_at);
```

### Для пользователей

```sql
CREATE INDEX idx_users_email ON store.users(email);
CREATE INDEX idx_users_username ON store.users(username);
CREATE INDEX idx_users_role ON store.users(role);
CREATE INDEX idx_users_active ON store.users(is_active);
```

## Триггеры и функции

```sql
-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION store.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для таблиц
CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON store.categories 
    FOR EACH ROW EXECUTE FUNCTION store.update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON store.products 
    FOR EACH ROW EXECUTE FUNCTION store.update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON store.users 
    FOR EACH ROW EXECUTE FUNCTION store.update_updated_at_column();
```

## Заполнение данными

### Категории уровня 1

```sql
INSERT INTO store.categories (id, name, parent_id, description, sort_order) VALUES
(1, 'Электроника', NULL, 'Электронные устройства и гаджеты', 1),
(2, 'Бытовая техника', NULL, 'Техника для дома', 2),
(3, 'Одежда', NULL, 'Одежда и аксессуары', 3),
(4, 'Мебель', NULL, 'Мебель для дома и офиса', 4);
```

### Категории уровня 2

```sql
-- Для Электроники
INSERT INTO store.categories (id, name, parent_id, description, sort_order) VALUES
(100, 'Смартфоны и гаджеты', 1, 'Мобильные устройства и гаджеты', 1),
(101, 'Компьютерная техника', 1, 'Компьютеры и комплектующие', 2),
(102, 'Бытовая электроника', 1, 'Электроника для дома', 3);

-- Для Бытовая техника
INSERT INTO store.categories (id, name, parent_id, description, sort_order) VALUES
(200, 'Крупная техника', 2, 'Крупная бытовая техника', 1),
(201, 'Кухонная техника', 2, 'Техника для кухни', 2),
(202, 'Климатическая техника', 2, 'Техника для климат-контроля', 3);
```

### Категории уровня 3 (пример для Электроники)

```sql
-- Для Смартфоны и гаджеты
INSERT INTO store.categories (id, name, parent_id, description, sort_order) VALUES
(10000, 'Смартфоны', 100, 'Мобильные телефоны', 1),
(10001, 'Планшеты', 100, 'Планшеты и iPad', 2),
(10002, 'Умные часы', 100, 'Смарт-часы', 3),
(10003, 'Фитнес-браслеты', 100, 'Фитнес-трекеры', 4);

-- Для Компьютерная техника
INSERT INTO store.categories (id, name, parent_id, description, sort_order) VALUES
(10100, 'Ноутбуки', 101, 'Портативные компьютеры', 1),
(10101, 'Системные блоки', 101, 'Стационарные компьютеры', 2),
(10102, 'Мониторы', 101, 'Компьютерные мониторы', 3),
(10103, 'Периферия', 101, 'Компьютерная периферия', 4);
```

### Добавление товаров

```sql
INSERT INTO store.products (name, category_id, company, price_per_item, amount, manufacturer, location, description, sku) VALUES
-- Смартфоны
('iPhone 15 Pro 256GB', 10000, 'Apple', 999.99, 10, 'USA', 'Секция A-1', 'Флагманский смартфон', 'APP-IP15P-256'),
('Samsung Galaxy S24', 10000, 'Samsung', 849.99, 15, 'South Korea', 'Секция A-2', 'Смартфон с ИИ', 'SAM-GS24-256'),

-- Ноутбуки
('MacBook Air M2', 10100, 'Apple', 1199.99, 5, 'USA', 'Секция B-1', 'Ноутбук с M2', 'APP-MBA-M2'),
('ASUS ROG Strix', 10100, 'ASUS', 1599.99, 3, 'China', 'Секция B-2', 'Игровой ноутбук', 'ASUS-ROG-G15');
```

## Полезные запросы

### Рекурсивный запрос для дерева категорий

```sql
WITH RECURSIVE category_tree AS (
    SELECT 
        id, 
        name, 
        parent_id,
        1 as level,
        name as full_path
    FROM store.categories 
    WHERE parent_id IS NULL
    
    UNION ALL
    
    SELECT 
        c.id, 
        c.name, 
        c.parent_id,
        ct.level + 1,
        ct.full_path || ' → ' || c.name
    FROM store.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT 
    id,
    name,
    level,
    full_path
FROM category_tree 
ORDER BY full_path;
```

### Статистика по уровням категорий

```sql
SELECT 
    CASE 
        WHEN parent_id IS NULL THEN 'Level 1 (Root)'
        WHEN parent_id IN (1,2,3,4) THEN 'Level 2'
        ELSE 'Level 3'
    END as level_type,
    COUNT(*) as category_count
FROM store.categories 
GROUP BY level_type
ORDER BY level_type;
```

### Товары с полными путями категорий

```sql
SELECT 
    p.name as product_name,
    p.price_per_item,
    p.amount,
    c3.name as category_level3,
    c2.name as category_level2, 
    c1.name as category_level1
FROM store.products p
JOIN store.categories c3 ON p.category_id = c3.id
JOIN store.categories c2 ON c3.parent_id = c2.id
JOIN store.categories c1 ON c2.parent_id = c1.id
ORDER BY c1.name, c2.name, c3.name;
```