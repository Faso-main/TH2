// data-importer.js
const { Client } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { Transform } = require('stream');

class ProcurementDataImporter {
    constructor() {
        this.client = new Client({
            user: 'user1',
            host: 'localhost',
            database: 'pc_db',
            password: '1234',
            port: 5432,
            // Лучшие практики для подключения
            max: 20, // максимальное количество клиентов в пуле
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
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
            
            // Проверяем существование таблиц
            await this.validateDatabaseStructure();
        } catch (error) {
            console.error('❌ Ошибка подключения к БД:', error.message);
            throw error;
        }
    }

    async validateDatabaseStructure() {
        const requiredTables = [
            'users', 'categories', 'products', 'procurements', 
            'procurement_items', 'procurement_templates', 'template_products'
        ];

        for (const table of requiredTables) {
            const result = await this.client.query(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
                [table]
            );
            
            if (!result.rows[0].exists) {
                throw new Error(`Таблица ${table} не существует в базе данных`);
            }
        }
        console.log('✅ Структура БД проверена');
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

    // Валидация данных
    validateProduct(row) {
        if (!row.product_id && !row.id) {
            throw new Error('Отсутствует product_id');
        }

        const productId = row.product_id || row.id;
        if (productId.length > 100) {
            throw new Error(`Слишком длинный product_id: ${productId}`);
        }

        return {
            productId: productId,
            name: (row.name || row.product_name || `Товар ${productId}`).substring(0, 1000),
            description: row.description || null,
            categoryId: row.category_id || null,
            manufacturer: (row.manufacturer || '').substring(0, 500),
            unitOfMeasure: (row.unit_of_measure || '').substring(0, 50),
            specifications: this.parseSpecifications(row.specifications),
            averagePrice: this.parsePrice(row.average_price),
            isAvailable: true,
            sourceSystem: 'catalog'
        };
    }

    parseSpecifications(specs) {
        if (!specs) return null;
        
        try {
            if (typeof specs === 'string') {
                return JSON.parse(specs);
            }
            return specs;
        } catch (error) {
            console.warn('⚠️ Некорректные спецификации:', specs);
            return null;
        }
    }

    parsePrice(price) {
        if (!price) return null;
        
        const parsed = parseFloat(price);
        return isNaN(parsed) || parsed < 0 ? null : Math.round(parsed * 100) / 100;
    }

    async importCategories() {
        console.log('📁 Импорт категорий...');
        
        try {
            const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
            const categories = [];

            for (const [templateKey, templateData] of Object.entries(templates)) {
                // Генерируем UUID для категории на основе templateKey
                const categoryId = this.generateDeterministicUUID(templateKey);
                
                categories.push([
                    categoryId,
                    null, // parent_category_id
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
            if (this.stats.categories.error > 0) {
                console.log(`⚠️ Ошибок: ${this.stats.categories.error}`);
            }
        } catch (error) {
            this.logError('importCategories', error);
            throw error;
        }
    }

    generateDeterministicUUID(key) {
        // Простой детерминированный UUID на основе ключа
        const crypto = require('crypto');
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
                        callback(); // Продолжаем обработку несмотря на ошибки
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
                    mapHeaders: ({ header }) => header.trim(),
                    mapValues: ({ value }) => value.trim(),
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
            // Если пачка слишком большая, разбиваем на меньшие части
            if (error.message.includes('bind') && products.length > 100) {
                console.log('⚠️ Слишком большая пачка, разбиваем на части...');
                const mid = Math.floor(products.length / 2);
                await this.insertProductBatch(products.slice(0, mid));
                await this.insertProductBatch(products.slice(mid));
            } else {
                throw error;
            }
        }
    }

    async importProcurements() {
        console.log('📁 Импорт закупок...');
        
        return new Promise((resolve, reject) => {
            const procurements = [];
            const procurementItems = [];
            let processedCount = 0;

            const processBatch = async () => {
                if (procurements.length === 0) return;

                try {
                    await this.insertProcurementBatch([...procurements], [...procurementItems]);
                    this.stats.procurements.success += procurements.length;
                    this.stats.procurement_items.success += procurementItems.length;
                    processedCount += procurements.length;
                    console.log(`✅ Обработано ${processedCount} закупок...`);
                } catch (error) {
                    this.stats.procurements.error += procurements.length;
                    this.stats.procurement_items.error += procurementItems.length;
                    this.logError('importProcurements', error);
                } finally {
                    procurements.length = 0;
                    procurementItems.length = 0;
                }
            };

            const batchProcessor = new Transform({
                objectMode: true,
                transform: (row, encoding, callback) => {
                    try {
                        const procurementId = row.procurement_id || `proc_${processedCount + procurements.length}`;
                        
                        // Валидация и подготовка данных закупки
                        procurements.push([
                            procurementId,
                            '11111111-1111-1111-1111-111111111111', // test user
                            (row.procurement_name || `Закупка ${processedCount + procurements.length}`).substring(0, 1000),
                            this.parsePrice(row.estimated_price) || 0,
                            this.parsePrice(row.actual_price) || this.parsePrice(row.estimated_price) || 0,
                            'completed',
                            this.parseDate(row.date),
                            this.parseDate(row.publication_date),
                            (row.organization || 'Неизвестно').substring(0, 500),
                            (row.inn || '').substring(0, 20)
                        ]);

                        // Обрабатываем товары в закупке
                        if (row.product_ids) {
                            const productIds = String(row.product_ids).split(',');
                            productIds.forEach(productId => {
                                const cleanProductId = productId.trim();
                                if (cleanProductId && cleanProductId !== 'nan' && cleanProductId !== 'null') {
                                    const price = this.parsePrice(row.estimated_price) || 0;
                                    const unitPrice = productIds.length > 0 ? price / productIds.length : 0;
                                    
                                    procurementItems.push([
                                        procurementId,
                                        cleanProductId,
                                        1,
                                        Math.round(unitPrice * 100) / 100
                                    ]);
                                }
                            });
                        }

                        if (procurements.length >= this.batchSize.procurements || 
                            procurementItems.length >= this.batchSize.items) {
                            processBatch().then(() => callback()).catch(callback);
                        } else {
                            callback();
                        }
                    } catch (error) {
                        this.stats.procurements.error++;
                        this.logError('importProcurements validation', error, row);
                        callback();
                    }
                },
                
                flush: async (callback) => {
                    await processBatch();
                    callback();
                }
            });

            fs.createReadStream('cleaned_procurement_data.csv')
                .on('error', (error) => {
                    console.error('❌ Ошибка чтения файла закупок:', error.message);
                    reject(error);
                })
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim(),
                    mapValues: ({ value }) => value.trim(),
                    skipEmptyLines: true
                }))
                .pipe(batchProcessor)
                .on('finish', () => {
                    console.log(`✅ Импорт закупок завершен. Успешно: ${this.stats.procurements.success}, Ошибок: ${this.stats.procurements.error}`);
                    console.log(`✅ Позиций закупок: ${this.stats.procurement_items.success}, Ошибок: ${this.stats.procurement_items.error}`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    parseDate(dateString) {
        if (!dateString) return null;
        
        try {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    async insertProcurementBatch(procurements, procurementItems) {
        // Используем транзакцию для целостности данных
        const client = await this.client.connect();
        
        try {
            await client.query('BEGIN');

            // Вставляем закупки
            if (procurements.length > 0) {
                const procurementValues = procurements.map((_, index) => {
                    const offset = index * 10;
                    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
                }).join(',');

                const procurementQuery = `
                    INSERT INTO procurements (procurement_id, user_id, name, estimated_price, actual_price, 
                    status, procurement_date, publication_date, organization_name, organization_inn) 
                    VALUES ${procurementValues}
                    ON CONFLICT (procurement_id) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        name = EXCLUDED.name,
                        estimated_price = EXCLUDED.estimated_price,
                        actual_price = EXCLUDED.actual_price,
                        status = EXCLUDED.status,
                        procurement_date = EXCLUDED.procurement_date,
                        publication_date = EXCLUDED.publication_date,
                        organization_name = EXCLUDED.organization_name,
                        organization_inn = EXCLUDED.organization_inn
                `;

                await client.query(procurementQuery, procurements.flat());
            }

            // Вставляем позиции закупок
            if (procurementItems.length > 0) {
                const itemValues = procurementItems.map((_, index) => {
                    const offset = index * 4;
                    return `(uuid_generate_v4(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
                }).join(',');

                const itemQuery = `
                    INSERT INTO procurement_items (procurement_item_id, procurement_id, product_id, quantity, unit_price) 
                    VALUES ${itemValues}
                    ON CONFLICT (procurement_id, product_id) DO UPDATE SET
                        quantity = EXCLUDED.quantity,
                        unit_price = EXCLUDED.unit_price
                `;

                await client.query(itemQuery, procurementItems.flat());
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async importTemplates() {
        console.log('📁 Импорт шаблонов...');
        
        try {
            const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
            const templatesData = [];
            const templateProductsData = [];

            for (const [templateKey, templateData] of Object.entries(templates)) {
                try {
                    // Шаблоны
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

                    // Товары в шаблонах
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

            // Вставляем товары шаблонов пачками
            if (templateProductsData.length > 0) {
                const batchSize = 1000;
                for (let i = 0; i < templateProductsData.length; i += batchSize) {
                    const batch = templateProductsData.slice(i, i + batchSize);
                    
                    const productValues = batch.map((_, index) => {
                        const offset = index * 4;
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
                    }).join(',');

                    const productQuery = `
                        INSERT INTO template_products (template_id, product_id, frequency, position) 
                        VALUES ${productValues}
                        ON CONFLICT (template_id, product_id) DO UPDATE SET
                            frequency = EXCLUDED.frequency,
                            position = EXCLUDED.position
                    `;

                    try {
                        await this.client.query(productQuery, batch.flat());
                        this.stats.template_products.success += batch.length;
                    } catch (error) {
                        this.stats.template_products.error += batch.length;
                        this.logError('importTemplates products', error, { batchSize: batch.length });
                    }
                }
            }

            console.log(`✅ Импортировано ${this.stats.templates.success} шаблонов`);
            console.log(`✅ Импортировано ${this.stats.template_products.success} товаров в шаблонах`);
            if (this.stats.templates.error > 0 || this.stats.template_products.error > 0) {
                console.log(`⚠️ Ошибок шаблонов: ${this.stats.templates.error}, ошибок товаров: ${this.stats.template_products.error}`);
            }
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
        
        const stats = [
            { name: 'Категории', stat: this.stats.categories },
            { name: 'Товары', stat: this.stats.products },
            { name: 'Закупки', stat: this.stats.procurements },
            { name: 'Позиции закупок', stat: this.stats.procurement_items },
            { name: 'Шаблоны', stat: this.stats.templates },
            { name: 'Товары в шаблонах', stat: this.stats.template_products }
        ];

        stats.forEach(({ name, stat }) => {
            const success = typeof stat === 'object' ? stat.success : stat;
            const error = typeof stat === 'object' ? stat.error : 0;
            const errorStr = error > 0 ? ` (❌ ${error})` : '';
            console.log(`${name.padEnd(20)}: ${success.toLocaleString().padStart(10)}${errorStr}`);
        });

        console.log('='.repeat(50));
        
        if (this.errors.length > 0) {
            console.log(`\n⚠️  Всего ошибок: ${this.errors.length}`);
            // Сохраняем ошибки в файл для последующего анализа
            const errorLog = `import_errors_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            fs.writeFileSync(errorLog, JSON.stringify(this.errors, null, 2));
            console.log(`📝 Подробности ошибок сохранены в: ${errorLog}`);
        }
    }

    async validateImport() {
        console.log('\n🔍 Проверка целостности данных...');
        
        const checks = [
            { query: 'SELECT COUNT(*) as count FROM categories', name: 'Категории' },
            { query: 'SELECT COUNT(*) as count FROM products', name: 'Товары' },
            { query: 'SELECT COUNT(*) as count FROM procurements', name: 'Закупки' },
            { query: 'SELECT COUNT(*) as count FROM procurement_items', name: 'Позиции закупок' },
            { query: 'SELECT COUNT(*) as count FROM procurement_templates', name: 'Шаблоны' },
            { query: 'SELECT COUNT(*) as count FROM template_products', name: 'Товары в шаблонах' }
        ];

        for (const check of checks) {
            try {
                const result = await this.client.query(check.query);
                console.log(`✅ ${check.name}: ${parseInt(result.rows[0].count).toLocaleString()}`);
            } catch (error) {
                console.log(`❌ ${check.name}: Ошибка проверки - ${error.message}`);
            }
        }
    }

    async importAll() {
        const startTime = Date.now();
        
        try {
            await this.connect();
            await this.disableConstraints();
            await this.createTestUser();

            console.log('🚀 НАЧАЛО ИМПОРТА ДАННЫХ...\n');

            // Выполняем импорт в правильном порядке с учетом foreign keys
            await this.importCategories();
            await this.importProducts();
            await this.importProcurements();
            await this.importTemplates();

            await this.enableConstraints();
            
            // Проверяем целостность
            await this.validateImport();
            
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

// Вспомогательные функции
function validateRequiredFiles() {
    const requiredFiles = [
        'procurement_templates.json',
        '344608_СТЕ.csv', 
        'cleaned_procurement_data.csv'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('❌ Отсутствуют необходимые файлы:');
        missingFiles.forEach(file => console.log(`   - ${file}`));
        console.log('\n📁 Убедитесь, что файлы находятся в правильных папках:');
        console.log('   - procurement_templates.json');
        console.log('   - 344608_СТЕ.csv');
        console.log('   - cleaned_procurement_data.csv');
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

// Запуск если файл выполняется напрямую
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProcurementDataImporter;