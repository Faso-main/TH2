// restore-and-categorize.js
const { Client } = require('pg');
const fs = require('fs');

class DataRestorer {
    constructor() {
        this.client = new Client({
            user: 'faso_user',
            host: 'localhost',
            database: 'pc_db',
            password: '1234',
            port: 5432,
        });
    }

    async connect() {
        await this.client.connect();
        console.log('✅ Подключение к БД установлено');
    }

    async disconnect() {
        await this.client.end();
        console.log('✅ Подключение к БД закрыто');
    }

    async checkData() {
        console.log('🔍 Проверка данных в БД...');
        
        const tables = {
            'products': 'SELECT COUNT(*) as count FROM products',
            'categories': 'SELECT COUNT(*) as count FROM categories', 
            'procurements': 'SELECT COUNT(*) as count FROM procurements',
            'procurement_items': 'SELECT COUNT(*) as count FROM procurement_items'
        };
        
        const results = {};
        for (const [table, query] of Object.entries(tables)) {
            const result = await this.client.query(query);
            const count = parseInt(result.rows[0].count);
            results[table] = count;
            console.log(`   ${table}: ${count.toLocaleString()} записей`);
        }
        
        return results;
    }

    async importData() {
        console.log('\n🔄 Запуск импорта данных через ProcurementDataImporter...');
        
        try {
            // Динамически импортируем ваш класс
            const { ProcurementDataImporter } = require('./set_prod.js');
            const importer = new ProcurementDataImporter();
            
            // Запускаем импорт но только товаров и категорий
            await importer.connect();
            await importer.disableConstraints();
            await importer.createTestUser();
            
            console.log('\n📥 Импорт категорий...');
            await importer.importCategories();
            
            console.log('\n📥 Импорт товаров...');
            await importer.importProducts();
            
            await importer.enableConstraints();
            await importer.disconnect();
            
            console.log('✅ Импорт данных завершен');
            
        } catch (error) {
            console.error('❌ Ошибка импорта:', error.message);
            throw error;
        }
    }

    async restoreIfNeeded() {
        await this.connect();
        
        const data = await this.checkData();
        
        // Если товаров мало или нет, запускаем импорт
        if (data.products < 1000) {
            console.log(`\n⚠️  Обнаружено мало товаров (${data.products}), запускаем импорт...`);
            await this.importData();
        } else {
            console.log('\n✅ Данные присутствуют в достаточном количестве');
        }
        
        await this.disconnect();
        return data.products > 1000; // true если данные есть
    }
}

class CategoryManager {
    constructor() {
        this.client = new Client({
            user: 'store_app1',
            host: 'localhost',
            database: 'pc_db',
            password: '1234',
            port: 5432,
        });
        
        this.categoryMap = new Map();
        this.keywordToCategory = new Map();
    }

    async connect() {
        await this.client.connect();
        console.log('✅ Подключение к БД установлено');
    }

    async disconnect() {
        await this.client.end();
        console.log('✅ Подключение к БД закрыто');
    }

    loadCategoryHierarchy() {
        console.log('📁 Загрузка иерархии категорий...');
        try {
            const flatCategories = JSON.parse(fs.readFileSync('flat_category_hierarchy.json', 'utf8'));
            console.log(`✅ Загружено ${flatCategories.length} категорий`);
            return flatCategories;
        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error.message);
            throw error;
        }
    }

    generateDeterministicUUID(key) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
    }

    async importCategories(flatCategories) {
        console.log('📁 Импорт категорий в БД...');
        
        try {
            let importedCount = 0;
            let updatedCount = 0;
            
            for (const categoryData of flatCategories) {
                const categoryPath = categoryData.category_path;
                const parts = categoryPath.split(' -> ');
                const categoryName = parts[parts.length - 1];
                const level = categoryData.level;
                
                const categoryId = this.generateDeterministicUUID(categoryPath);
                
                let parentCategoryId = null;
                if (parts.length > 1) {
                    const parentPath = parts.slice(0, -1).join(' -> ');
                    parentCategoryId = this.generateDeterministicUUID(parentPath);
                }
                
                this.categoryMap.set(categoryPath, categoryId);
                
                if (categoryData.keywords) {
                    categoryData.keywords.forEach(keyword => {
                        this.keywordToCategory.set(keyword.toLowerCase(), categoryId);
                    });
                }
                
                // Проверяем существование категории
                const checkResult = await this.client.query(
                    'SELECT category_id FROM categories WHERE category_id = $1',
                    [categoryId]
                );
                
                if (checkResult.rows.length === 0) {
                    const query = `
                        INSERT INTO categories (category_id, parent_category_id, name, description, keywords, level) 
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `;
                    
                    await this.client.query(query, [
                        categoryId,
                        parentCategoryId,
                        categoryName,
                        `Категория: ${categoryPath}`,
                        categoryData.keywords || [],
                        level
                    ]);
                    importedCount++;
                } else {
                    const query = `
                        UPDATE categories 
                        SET parent_category_id = $1, name = $2, description = $3, keywords = $4, level = $5
                        WHERE category_id = $6
                    `;
                    
                    await this.client.query(query, [
                        parentCategoryId,
                        categoryName,
                        `Категория: ${categoryPath}`,
                        categoryData.keywords || [],
                        level,
                        categoryId
                    ]);
                    updatedCount++;
                }
            }
            
            console.log(`✅ Импортировано ${importedCount} новых категорий`);
            console.log(`✅ Обновлено ${updatedCount} существующих категорий`);
            console.log(`✅ Создано ${this.keywordToCategory.size} ключевых слов`);
            
        } catch (error) {
            console.error('❌ Ошибка импорта категорий:', error.message);
            throw error;
        }
    }

    findCategoryForProduct(productName) {
        if (!productName) return null;
        
        const nameLower = productName.toLowerCase();
        
        // Приоритетный поиск по точным совпадениям
        for (const [keyword, categoryId] of this.keywordToCategory.entries()) {
            // Используем границы слов для более точного поиска
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(productName)) {
                return categoryId;
            }
        }
        
        // Поиск по частичным совпадениям
        for (const [keyword, categoryId] of this.keywordToCategory.entries()) {
            if (nameLower.includes(keyword)) {
                return categoryId;
            }
        }
        
        return null;
    }

    async categorizeProducts() {
        console.log('🏷️ Присвоение категорий товарам...');
        
        try {
            // Получаем ВСЕ товары
            const result = await this.client.query(`
                SELECT product_id, name, category_id 
                FROM products 
                ORDER BY product_id
            `);
            
            console.log(`📊 Найдено ${result.rows.length.toLocaleString()} товаров всего`);
            
            let newCategoriesCount = 0;
            let updatedCategoriesCount = 0;
            const batchSize = 500;
            
            // Обрабатываем батчами для эффективности
            for (let i = 0; i < result.rows.length; i += batchSize) {
                const batch = result.rows.slice(i, i + batchSize);
                const updates = [];
                
                for (const product of batch) {
                    const newCategoryId = this.findCategoryForProduct(product.name);
                    
                    if (newCategoryId && product.category_id !== newCategoryId) {
                        updates.push({
                            productId: product.product_id,
                            categoryId: newCategoryId,
                            hadCategory: !!product.category_id
                        });
                    }
                }
                
                // Выполняем обновления для этого батча
                if (updates.length > 0) {
                    const updateQuery = `
                        UPDATE products 
                        SET category_id = $1 
                        WHERE product_id = $2
                    `;
                    
                    for (const update of updates) {
                        await this.client.query(updateQuery, [update.categoryId, update.productId]);
                        
                        if (update.hadCategory) {
                            updatedCategoriesCount++;
                        } else {
                            newCategoriesCount++;
                        }
                    }
                }
                
                // Прогресс каждые 5000 товаров
                if ((i + batchSize) % 5000 === 0) {
                    console.log(`   ... обработано ${Math.min(i + batchSize, result.rows.length).toLocaleString()} товаров`);
                }
            }
            
            console.log(`🎉 Категории присвоены для ${newCategoriesCount.toLocaleString()} новых товаров`);
            console.log(`🔄 Обновлены категории для ${updatedCategoriesCount.toLocaleString()} товаров`);
            
            // Финальная статистика
            await this.showFinalStats();
            
        } catch (error) {
            console.error('❌ Ошибка присвоения категорий:', error.message);
            throw error;
        }
    }

    async showFinalStats() {
        console.log('\n📊 ФИНАЛЬНАЯ СТАТИСТИКА:');
        console.log('='.repeat(50));
        
        const stats = await this.client.query(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(category_id) as with_category,
                COUNT(*) - COUNT(category_id) as without_category
            FROM products
        `);
        
        const row = stats.rows[0];
        console.log(`📦 Всего товаров: ${parseInt(row.total_products).toLocaleString()}`);
        console.log(`✅ С категориями: ${parseInt(row.with_category).toLocaleString()}`);
        console.log(`❌ Без категорий: ${parseInt(row.without_category).toLocaleString()}`);
        console.log(`📈 Процент категоризации: ${((row.with_category / row.total_products) * 100).toFixed(1)}%`);
        
        // Топ-10 категорий
        const topCategories = await this.client.query(`
            SELECT c.name, COUNT(p.product_id) as product_count
            FROM categories c
            JOIN products p ON c.category_id = p.category_id
            GROUP BY c.category_id, c.name
            ORDER BY product_count DESC
            LIMIT 10
        `);
        
        console.log('\n🏆 Топ-10 категорий по количеству товаров:');
        topCategories.rows.forEach((category, index) => {
            console.log(`   ${index + 1}. ${category.name}: ${parseInt(category.product_count).toLocaleString()} товаров`);
        });
        
        // Примеры успешной категоризации
        const examples = await this.client.query(`
            SELECT p.name, c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.category_id
            WHERE LENGTH(p.name) > 10
            ORDER BY RANDOM()
            LIMIT 5
        `);
        
        console.log('\n🔍 Примеры категоризации:');
        examples.rows.forEach(example => {
            const shortName = example.name.length > 50 ? example.name.substring(0, 47) + '...' : example.name;
            console.log(`   📦 "${shortName}"`);
            console.log(`      → ${example.category_name}`);
        });
    }

    async execute() {
        const startTime = Date.now();
        
        try {
            await this.connect();
            
            console.log('🚀 ЗАПУСК КАТЕГОРИЗАЦИИ...\n');
            
            // 1. Загружаем иерархию
            const flatCategories = this.loadCategoryHierarchy();
            
            // 2. Импортируем/обновляем категории
            await this.importCategories(flatCategories);
            
            // 3. Присваиваем категории товарам
            await this.categorizeProducts();
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n🎉 КАТЕГОРИЗАЦИЯ ЗАВЕРШЕНА за ${duration} секунд!`);
            
        } catch (error) {
            console.error('💥 Ошибка:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// Главная функция
async function main() {
    console.log('🎯 ВОССТАНОВЛЕНИЕ ДАННЫХ И КАТЕГОРИЗАЦИЯ\n');
    
    try {
        // 1. Проверяем и восстанавливаем данные
        console.log('1. ПРОВЕРКА И ВОССТАНОВЛЕНИЕ ДАННЫХ');
        console.log('='.repeat(40));
        const restorer = new DataRestorer();
        const hasData = await restorer.restoreIfNeeded();
        
        if (!hasData) {
            console.log('\n⚠️  Данные не были восстановлены. Проверьте файлы и скрипты импорта.');
            return;
        }
        
        // 2. Запускаем категоризацию
        console.log('\n2. КАТЕГОРИЗАЦИЯ ТОВАРОВ');
        console.log('='.repeat(40));
        const categorizer = new CategoryManager();
        await categorizer.execute();
        
        console.log('\n✅ ВСЕ ЗАДАЧИ ВЫПОЛНЕНЫ!');
        console.log('🎉 Система готова к работе с полной категоризацией товаров');
        
    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error.message);
        process.exit(1);
    }
}

// Проверка файлов
function validateFiles() {
    const requiredFiles = [
        'flat_category_hierarchy.json',
        'set_prod.js'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('❌ Отсутствуют необходимые файлы:');
        missingFiles.forEach(file => console.log(`   - ${file}`));
        return false;
    }

    return true;
}

if (require.main === module) {
    if (!validateFiles()) {
        process.exit(1);
    }
    
    main().catch(console.error);
}

module.exports = { DataRestorer, CategoryManager };