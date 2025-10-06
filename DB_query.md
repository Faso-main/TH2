# Запросы

## Добавление новых товаров

### Добавление смартфона
```sql
INSERT INTO store.products (name, category_id, company, price_per_item, amount, manufacturer, location, description, sku) 
VALUES ('Google Pixel 8', 10000, 'Google', 799.99, 12, 'USA', 'Секция A-4, Полка 2', 'Смартфон с чистом Tensor G3', 'GOOG-PXL8-128');
```

### Добавление товара с JSON спецификациями
```sql
INSERT INTO store.products (name, category_id, company, price_per_item, amount, manufacturer, specifications, sku) 
VALUES ('Игровая мышь', 10103, 'Logitech', 89.99, 30, 'China', 
        '{"type": "оптическая", "dpi": 16000, "buttons": 6, "connectivity": "USB"}'::jsonb, 
        'LOG-G502');
```

### Пакетное добавление товаров
```sql
INSERT INTO store.products (name, category_id, company, price_per_item, amount, sku) VALUES
('Huawei P60', 10000, 'Huawei', 649.99, 8, 'HUA-P60-256'),
('Наушники Sony', 10201, 'Sony', 199.99, 15, 'SON-WH1000'),
('Кофемашина DeLonghi', 20101, 'DeLonghi', 299.99, 5, 'DEL-ECAM');
```

## Добавление пользователей

### Покупатель
```sql
INSERT INTO store.users (username, email, password_hash, first_name, last_name, phone, role, address) 
VALUES ('ivanov', 'ivanov@mail.com', 'hashed_password_123', 'Иван', 'Иванов', '+79161234567', 'customer', 
        '{"city": "Москва", "street": "Ленина", "house": "15", "apartment": "42"}'::jsonb);
```

### Менеджер
```sql
INSERT INTO store.users (username, email, password_hash, first_name, role) 
VALUES ('manager2', 'manager2@store.com', 'hashed_password_456', 'Петр', 'manager');
```

## Добавление категорий

### Подкатегория
```sql
INSERT INTO store.categories (name, parent_id, description, sort_order) 
VALUES ('Электронные книги', 100, 'Электронные ридеры', 5);
```

### Корневая категория
```sql
INSERT INTO store.categories (name, description, sort_order) 
VALUES ('Спорт и отдых', 'Спортивные товары и инвентарь', 5);
```

## Поисковые запросы

### Поиск товаров

#### По названию (регистронезависимый)
```sql
SELECT * FROM store.products 
WHERE LOWER(name) LIKE LOWER('%iphone%') 
AND is_active = true;
```

#### По категории и цене
```sql
SELECT p.name, p.price_per_item, p.amount, c.name as category_name
FROM store.products p
JOIN store.categories c ON p.category_id = c.id
WHERE p.category_id = 10000 
AND p.price_per_item BETWEEN 500 AND 1000
AND p.is_active = true;
```

#### По бренду и наличию
```sql
SELECT name, price_per_item, amount 
FROM store.products 
WHERE company = 'Apple' 
AND amount > 0
ORDER BY price_per_item DESC;
```

#### По JSON спецификациям
```sql
SELECT name, price_per_item, specifications->>'dpi' as dpi
FROM store.products 
WHERE specifications->>'connectivity' = 'USB'
AND specifications->>'type' = 'оптическая';
```

### Поиск пользователей

#### По email
```sql
SELECT * FROM store.users 
WHERE email = 'customer1@mail.com';
```

#### По роли
```sql
SELECT username, email, first_name, last_name, role 
FROM store.users 
WHERE role = 'customer' 
AND is_active = true;
```

#### По JSON адресу
```sql
SELECT username, first_name, address->>'city' as city 
FROM store.users 
WHERE address->>'city' = 'Москва';
```

### Поиск категорий

#### Подкатегории для родительской категории
```sql
SELECT c2.name as parent_category, c1.name as subcategory
FROM store.categories c1
JOIN store.categories c2 ON c1.parent_id = c2.id
WHERE c2.name = 'Электроника';
```

#### Корневые категории
```sql
SELECT name, description 
FROM store.categories 
WHERE parent_id IS NULL;
```

#### Полный путь категории (рекурсивный запрос)
```sql
WITH RECURSIVE category_path AS (
    SELECT id, name, parent_id, name as path
    FROM store.categories 
    WHERE id = 10000 -- Смартфоны
    
    UNION ALL
    
    SELECT c.id, c.name, c.parent_id, cp.path || ' ← ' || c.name
    FROM store.categories c
    JOIN category_path cp ON c.id = cp.parent_id
)
SELECT path FROM category_path 
WHERE parent_id IS NULL;
```

## Операции обновления

### Обновление товаров

#### Обновление цены и количества
```sql
UPDATE store.products 
SET price_per_item = 919.99, amount = 8, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

#### Массовое обновление цен
```sql
UPDATE store.products 
SET price_per_item = price_per_item * 0.9 -- скидка 10%
WHERE category_id = 10000 
AND is_active = true;
```

#### Обновление JSON спецификаций
```sql
UPDATE store.products 
SET specifications = jsonb_set(specifications, '{warranty}', '"2 года"')
WHERE id = 2;
```

### Обновление пользователей

#### Обновление профиля
```sql
UPDATE store.users 
SET first_name = 'Александр', phone = '+79169998877', 
    address = '{"city": "Санкт-Петербург", "street": "Невский", "house": "25"}'
WHERE id = 3;
```

#### Обновление времени последнего входа
```sql
UPDATE store.users 
SET last_login = CURRENT_TIMESTAMP 
WHERE username = 'customer1';
```

### Обновление категорий

#### Изменение порядка
```sql
UPDATE store.categories 
SET sort_order = 2 
WHERE name = 'Планшеты';
```

#### Деактивация категории
```sql
UPDATE store.categories 
SET is_active = false 
WHERE id = 10101; -- Системные блоки
```

## Операции удаления и деактивации

### Деактивация товаров

#### Деактивация одного товара
```sql
UPDATE store.products 
SET is_active = false, updated_at = CURRENT_TIMESTAMP
WHERE id = 5;
```

#### Массовая деактивация по производителю
```sql
UPDATE store.products 
SET is_active = false 
WHERE company = 'Xiaomi';
```

### Удаление записей

#### Удаление товара (только если нет на складе)
```sql
DELETE FROM store.products 
WHERE id = 10 
AND amount = 0;
```

#### Удаление пользователя
```sql
DELETE FROM store.users 
WHERE id = 4 
AND is_active = false;
```

#### Удаление пустой категории
```sql
DELETE FROM store.categories 
WHERE id NOT IN (SELECT DISTINCT category_id FROM store.products)
AND id NOT IN (SELECT DISTINCT parent_id FROM store.categories WHERE parent_id IS NOT NULL);
```

## Аналитические запросы

### Полная информация о товарах с категориями
```sql
SELECT 
    p.id,
    p.name as product_name,
    p.price_per_item,
    p.amount,
    p.company,
    p.sku,
    c3.name as subcategory,
    c2.name as category,
    c1.name as main_category
FROM store.products p
JOIN store.categories c3 ON p.category_id = c3.id
JOIN store.categories c2 ON c3.parent_id = c2.id  
JOIN store.categories c1 ON c2.parent_id = c1.id
WHERE p.is_active = true
ORDER BY c1.name, c2.name, c3.name, p.name;
```

### Статистика по категориям
```sql
SELECT 
    c.name as category_name,
    COUNT(p.id) as product_count,
    SUM(p.amount) as total_amount,
    AVG(p.price_per_item) as avg_price
FROM store.categories c
LEFT JOIN store.products p ON c.id = p.category_id AND p.is_active = true
WHERE c.parent_id IS NULL
GROUP BY c.id, c.name
ORDER BY product_count DESC;
```

## Пагинация

### Первая страница (10 товаров)
```sql
SELECT name, price_per_item, amount 
FROM store.products 
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 10 OFFSET 0; -- OFFSET = (page_number - 1) * limit
```

### Вторая страница
```sql
SELECT name, price_per_item, amount 
FROM store.products 
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 10 OFFSET 10;
```