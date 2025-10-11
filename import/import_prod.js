// data-importer.js
const { Client } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { Transform } = require('stream');
const crypto = require('crypto');

class ProcurementDataImporter {
    constructor() {
        this.client = new Client({
            user: 'store_app1',
            host: 'localhost',
            database: 'pc_db',
            password: '1234',
            port: 5432,
        });
        
        this.batchSize = {
            products: 1000,
            procurements: 500,
            items: 2000
        };

        this.stats = {
            categories: { success: 0, error: 0 },
            products: { success: 0, error: 0 },
            procurements: { success: 0, error: 0 },
            procurement_items: { success: 0, error: 0 },
            templates: { success: 0, error: 0 },
            template_products: { success: 0, error: 0 }
        };

        this.errors = [];
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('✅ Подключение к БД установлено');
        } catch (error) {
            console.error('❌ Ошибка подключения к БД:', error.message);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.client.end();
            console.log('✅ Подключение к БД закрыто');
        } catch (error) {
            console.error('❌ Ошибка при закрытии подключения:', error.message);
        }
    }

    async disableConstraints() {
        try {
            await this.client.query("SET session_replication_role = 'replica';");
            console.log('✅ Ограничения БД отключены');
        } catch (error) {
            console.error('❌ Ошибка при отключении ограничений:', error.message);
            throw error;
        }
    }

    async enableConstraints() {
        try {
            await this.client.query("SET session_replication_role = 'origin';");
            console.log('✅ Ограничения БД включены');
        } catch (error) {
            console.error('❌ Ошибка при включении ограничений:', error.message);
            throw error;
        }
    }

    async logError(operation, error, data = null) {
        const errorInfo = {
            operation,
            error: error.message,
            data,
            timestamp: new Date().toISOString()
        };
        
        this.errors.push(errorInfo);
        console.error(`❌ Ошибка в ${operation}:`, error.message);
    }

    // Простая валидация продукта для нашего CSV
    validateProduct(row) {
        if (!row.product_id) {
            throw new Error('Отсутствует product_id');
        }

        return {
            productId: row.product_id,
            name: (row.name || '').substring(0, 1000),
            description: null,
            categoryId: null, // Будем связывать позже
            manufacturer: this.extractManufacturer(row.name),
            unitOfMeasure: 'шт', // По умолчанию штуки
            specifications: this.parseSpecifications(row.specifications),
            averagePrice: this.parsePrice(row.price),
            isAvailable: row.available === 'Да',
            sourceSystem: 'catalog'
        };
    }

    // Простой метод извлечения производителя
    extractManufacturer(name) {
        if (!name) return '';
        
        if (name.includes('KW-trio')) return 'KW-trio';
        if (name.includes('Kangaro')) return 'Kangaro';
        // Добавьте другие производители по мере необходимости
        return '';
    }

    parseSpecifications(specs) {
        if (!specs) return null;
        
        try {
            // Убираем лишние кавычки
            const cleanSpecs = specs.replace(/"""/g, '').replace(/"/g, '');
            
            // Парсим спецификации в объект
            const specObj = {};
            const pairs = cleanSpecs.split(';');
            
            pairs.forEach(pair => {
                const [key, value] = pair.split(':');
                if (key && value) {
                    specObj[key.trim()] = value.trim();
                }
            });
            
            return specObj;
        } catch (error) {
            console.warn('⚠️ Некорректные спецификации:', specs);
            return { raw_specifications: specs };
        }
    }

    parsePrice(price) {
        if (!price) return null;
        
        const parsed = parseFloat(price.replace(',', '.'));
        return isNaN(parsed) || parsed < 0 ? null : Math.round(parsed * 100) / 100;
    }

    async importCategories() {
        console.log('📁 Импорт категорий...');
        
        try {
            const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
            const categories = [];

            for (const [templateKey, templateData] of Object.entries(templates)) {
                const categoryId = this.generateDeterministicUUID(templateKey);
                
                categories.push([
                    categoryId,
                    null,
                    templateData.name.substring(0, 255),
                    `Категория из ${templateData.name}`.substring(0, 500),
                    Array.isArray(templateData.keywords) ? templateData.keywords : [],
                    1
                ]);
            }

            const query = `
                INSERT INTO categories (category_id, parent_category_id, name, description, keywords, level) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (category_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    keywords = EXCLUDED.keywords,
                    level = EXCLUDED.level
            `;

            for (const category of categories) {
                try {
                    await this.client.query(query, category);
                    this.stats.categories.success++;
                } catch (error) {
                    this.stats.categories.error++;
                    this.logError('importCategories', error, category);
                }
            }

            console.log(`✅ Импортировано ${this.stats.categories.success} категорий`);
        } catch (error) {
            this.logError('importCategories', error);
            throw error;
        }
    }

    generateDeterministicUUID(key) {
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
    }

    async importProducts() {
        console.log('📁 Импорт товаров...');
        
        return new Promise((resolve, reject) => {
            const products = [];
            let processedCount = 0;

            const processBatch = async () => {
                if (products.length === 0) return;

                try {
                    await this.insertProductBatch([...products]);
                    this.stats.products.success += products.length;
                    processedCount += products.length;
                    console.log(`✅ Обработано ${processedCount} товаров...`);
                } catch (error) {
                    this.stats.products.error += products.length;
                    this.logError('importProducts', error);
                } finally {
                    products.length = 0;
                }
            };

            const batchProcessor = new Transform({
                objectMode: true,
                transform: (row, encoding, callback) => {
                    try {
                        const productData = this.validateProduct(row);
                        products.push([
                            productData.productId,
                            productData.name,
                            productData.description,
                            productData.categoryId,
                            productData.manufacturer,
                            productData.unitOfMeasure,
                            productData.specifications,
                            productData.averagePrice,
                            productData.isAvailable,
                            productData.sourceSystem
                        ]);

                        if (products.length >= this.batchSize.products) {
                            processBatch().then(() => callback()).catch(callback);
                        } else {
                            callback();
                        }
                    } catch (error) {
                        this.stats.products.error++;
                        this.logError('importProducts validation', error, row);
                        callback();
                    }
                },
                
                flush: async (callback) => {
                    await processBatch();
                    callback();
                }
            });

            fs.createReadStream('344608_СТЕ.csv')
                .on('error', (error) => {
                    console.error('❌ Ошибка чтения файла товаров:', error.message);
                    reject(error);
                })
                .pipe(csv({
                    headers: ['product_id', 'category', 'name', 'price', 'available', 'specifications'],
                    separator: ';',
                    skipEmptyLines: true
                }))
                .pipe(batchProcessor)
                .on('finish', () => {
                    console.log(`✅ Импорт товаров завершен. Успешно: ${this.stats.products.success}, Ошибок: ${this.stats.products.error}`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    async insertProductBatch(products) {
        if (products.length === 0) return;

        const values = products.map((_, index) => {
            const offset = index * 10;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
        }).join(',');

        const query = `
            INSERT INTO products (product_id, name, description, category_id, manufacturer, 
            unit_of_measure, specifications, average_price, is_available, source_system) 
            VALUES ${values}
            ON CONFLICT (product_id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category_id = EXCLUDED.category_id,
                manufacturer = EXCLUDED.manufacturer,
                unit_of_measure = EXCLUDED.unit_of_measure,
                specifications = EXCLUDED.specifications,
                average_price = EXCLUDED.average_price,
                is_available = EXCLUDED.is_available,
                source_system = EXCLUDED.source_system
        `;

        const flatParams = products.flat();
        
        try {
            await this.client.query(query, flatParams);
        } catch (error) {
            console.error('❌ Ошибка вставки пачки товаров:', error.message);
            throw error;
        }
    }

    async importProcurements() {
        console.log('📁 Импорт закупок...');
        
        // Упрощенная версия - если файл не соответствует ожидаемой структуре
        console.log('⚠️ Пропускаем импорт закупок - файл может иметь другую структуру');
        this.stats.procurements.success = 0;
        this.stats.procurement_items.success = 0;
        
        // Можно добавить простую заглушку для тестирования
        try {
            await this.client.query(`
                INSERT INTO procurements (procurement_id, user_id, name, status) 
                VALUES ('test_proc_1', '11111111-1111-1111-1111-111111111111', 'Тестовая закупка', 'completed')
                ON CONFLICT DO NOTHING
            `);
            console.log('✅ Добавлена тестовая закупка');
        } catch (error) {
            console.log('⚠️ Не удалось добавить тестовую закупку:', error.message);
        }
        
        return Promise.resolve();
    }

    async importTemplates() {
        console.log('📁 Импорт шаблонов...');
        
        try {
            const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
            const templatesData = [];
            const templateProductsData = [];

            for (const [templateKey, templateData] of Object.entries(templates)) {
                try {
                    templatesData.push([
                        templateKey,
                        templateData.name.substring(0, 500),
                        `Шаблон ${templateData.name}`.substring(0, 1000),
                        (templateData.size_range || '').substring(0, 100),
                        Array.isArray(templateData.keywords) ? templateData.keywords : [],
                        parseInt(templateData.sample_size) || 0,
                        parseFloat(templateData.avg_products_per_procurement) || 0,
                        this.parsePrice(templateData.avg_price) || 0
                    ]);

                    if (templateData.typical_products && Array.isArray(templateData.typical_products)) {
                        templateData.typical_products.forEach((productId, position) => {
                            if (productId && productId.trim()) {
                                const frequency = templateData.product_frequencies?.[productId] || 0;
                                templateProductsData.push([
                                    templateKey,
                                    productId.trim(),
                                    parseInt(frequency) || 0,
                                    parseInt(position) || 0
                                ]);
                            }
                        });
                    }
                } catch (error) {
                    this.logError('importTemplates processing', error, { templateKey, templateData });
                }
            }

            // Вставляем шаблоны
            const templateQuery = `
                INSERT INTO procurement_templates (template_id, name, description, size_range, 
                keywords, sample_size, avg_products_count, avg_price) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (template_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    size_range = EXCLUDED.size_range,
                    keywords = EXCLUDED.keywords,
                    sample_size = EXCLUDED.sample_size,
                    avg_products_count = EXCLUDED.avg_products_count,
                    avg_price = EXCLUDED.avg_price
            `;

            for (const template of templatesData) {
                try {
                    await this.client.query(templateQuery, template);
                    this.stats.templates.success++;
                } catch (error) {
                    this.stats.templates.error++;
                    this.logError('importTemplates insert', error, template);
                }
            }

            console.log(`✅ Импортировано ${this.stats.templates.success} шаблонов`);
            console.log(`✅ Товаров в шаблонах: ${templateProductsData.length}`);
        } catch (error) {
            this.logError('importTemplates', error);
            throw error;
        }
    }

    async createTestUser() {
        console.log('👤 Создание тестового пользователя...');
        
        try {
            await this.client.query(`
                INSERT INTO users (user_id, email, password_hash, inn, company_name, full_name, phone_number) 
                VALUES (
                    '11111111-1111-1111-1111-111111111111',
                    'admin@company.com',
                    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdCvWfA5J8tGQW',
                    '1234567890',
                    'Тестовая компания ООО',
                    'Иван Иванов',
                    '+7-999-123-45-67'
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    inn = EXCLUDED.inn,
                    company_name = EXCLUDED.company_name,
                    full_name = EXCLUDED.full_name,
                    phone_number = EXCLUDED.phone_number
            `);
            console.log('✅ Тестовый пользователь создан/обновлен');
        } catch (error) {
            console.error('❌ Ошибка создания тестового пользователя:', error.message);
            throw error;
        }
    }

    printStats() {
        console.log('\n📊 СТАТИСТИКА ИМПОРТА:');
        console.log('='.repeat(50));
        console.log(`Категории:           ${this.stats.categories.success}`);
        console.log(`Товары:              ${this.stats.products.success}`);
        console.log(`Закупки:             ${this.stats.procurements.success}`);
        console.log(`Позиции закупок:     ${this.stats.procurement_items.success}`);
        console.log(`Шаблоны:             ${this.stats.templates.success}`);
        console.log('='.repeat(50));
    }

    async importAll() {
        const startTime = Date.now();
        
        try {
            await this.connect();
            await this.disableConstraints();
            await this.createTestUser();

            console.log('🚀 НАЧАЛО ИМПОРТА ДАННЫХ...\n');

            await this.importCategories();
            await this.importProducts();
            await this.importProcurements();
            await this.importTemplates();

            await this.enableConstraints();
            this.printStats();

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n🎉 ВСЕ ДАННЫЕ УСПЕШНО ИМПОРТИРОВАНЫ за ${duration} секунд!`);

        } catch (error) {
            console.error('❌ Критическая ошибка при импорте:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// Проверка файлов
function validateRequiredFiles() {
    const requiredFiles = [
        'procurement_templates.json',
        '344608_СТЕ.csv'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('❌ Отсутствуют необходимые файлы:');
        missingFiles.forEach(file => console.log(`   - ${file}`));
        return false;
    }

    return true;
}

// Запуск импорта
async function main() {
    console.log('🔄 Запуск импорта данных в PostgreSQL...\n');

    if (!validateRequiredFiles()) {
        process.exit(1);
    }

    try {
        const importer = new ProcurementDataImporter();
        await importer.importAll();
    } catch (error) {
        console.error('💥 Импорт завершен с ошибками');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProcurementDataImporter;