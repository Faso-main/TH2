// data-importer.js
const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const { Transform } = require('stream');
const crypto = require('crypto');

class ProcurementDataImporter {
    constructor() {
        this.pool = new Pool({
            user: 'faso_user',
            host: 'localhost',
            database: 'pc_db',
            password: '1234',
            port: 5432,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        
        this.batchSize = {
            procurements: 200,
            items: 1000
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
        this.processedProcurements = new Set();
    }

    async connect() {
        try {
            const client = await this.pool.connect();
            client.release();
            console.log('Подключение к БД установлено');
        } catch (error) {
            console.error('Ошибка подключения к БД:', error.message);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.pool.end();
            console.log('Подключение к БД закрыто');
        } catch (error) {
            console.error('Ошибка при закрытии подключения:', error.message);
        }
    }

    async disableConstraints() {
        const client = await this.pool.connect();
        try {
            await client.query("SET session_replication_role = 'replica';");
            console.log('Ограничения БД отключены');
        } catch (error) {
            console.error('Ошибка при отключении ограничений:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    async enableConstraints() {
        const client = await this.pool.connect();
        try {
            await client.query("SET session_replication_role = 'origin';");
            console.log('Ограничения БД включены');
        } catch (error) {
            console.error('Ошибка при включении ограничений:', error.message);
            throw error;
        } finally {
            client.release();
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
        console.error(`Ошибка в ${operation}:`, error.message);
    }

    parsePrice(price) {
        if (!price) return null;
        const parsed = parseFloat(String(price).replace(',', '.'));
        return isNaN(parsed) || parsed < 0 ? null : Math.round(parsed * 100) / 100;
    }

    parseDate(dateString) {
        if (!dateString) return null;
        try {
            const cleanDate = String(dateString).split('.')[0];
            const date = new Date(cleanDate);
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    async importCategories() {
        console.log('Импорт категорий...');
        
        const client = await this.pool.connect();
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

            await client.query('DELETE FROM categories');

            const query = `
                INSERT INTO categories (category_id, parent_category_id, name, description, keywords, level) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `;

            for (const category of categories) {
                try {
                    await client.query(query, category);
                    this.stats.categories.success++;
                } catch (error) {
                    this.stats.categories.error++;
                    this.logError('importCategories', error, category);
                }
            }

            console.log(`Импортировано ${this.stats.categories.success} категорий`);
        } catch (error) {
            this.logError('importCategories', error);
            throw error;
        } finally {
            client.release();
        }
    }

    generateDeterministicUUID(key) {
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
    }

    async importProcurements() {
        console.log('Импорт закупок...');
        
        return new Promise((resolve, reject) => {
            const procurementsMap = new Map();
            const procurementItems = [];
            let processedCount = 0;

            const processBatch = async () => {
                if (procurementsMap.size === 0) return;

                try {
                    await this.insertProcurementBatch([...procurementsMap.values()], procurementItems);
                    this.stats.procurements.success += procurementsMap.size;
                    this.stats.procurement_items.success += procurementItems.length;
                    processedCount += procurementsMap.size;
                    console.log(`Обработано ${processedCount} закупок, ${procurementItems.length} позиций...`);
                } catch (error) {
                    this.stats.procurements.error += procurementsMap.size;
                    this.stats.procurement_items.error += procurementItems.length;
                    this.logError('importProcurements', error);
                } finally {
                    procurementsMap.clear();
                    procurementItems.length = 0;
                }
            };

            const batchProcessor = new Transform({
                objectMode: true,
                transform: (row, encoding, callback) => {
                    try {
                        const procurementId = row.procurement_id;
                        
                        if (!this.processedProcurements.has(procurementId)) {
                            if (!procurementsMap.has(procurementId)) {
                                procurementsMap.set(procurementId, {
                                    procurementId: procurementId,
                                    userId: '11111111-1111-1111-1111-111111111111',
                                    name: (row.procurement_name || `Закупка ${procurementId}`).substring(0, 1000),
                                    estimatedPrice: this.parsePrice(row.estimated_price),
                                    actualPrice: this.parsePrice(row.estimated_price),
                                    status: 'completed',
                                    procurementDate: this.parseDate(row.date),
                                    publicationDate: this.parseDate(row.date),
                                    organizationName: (row.organization || 'Неизвестно').substring(0, 500),
                                    organizationInn: (row.inn || '').substring(0, 20)
                                });
                            }

                            if (row.product_id && row.product_id.trim() && row.product_id.trim() !== '') {
                                const price = this.parsePrice(row.estimated_price) || 0;
                                
                                procurementItems.push([
                                    procurementId,
                                    row.product_id.trim(),
                                    1,
                                    price
                                ]);
                            }
                        }

                        if (procurementsMap.size >= this.batchSize.procurements || 
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
                    headers: ['procurement_id', 'date', 'organization', 'procurement_name', 'product_id', 'estimated_price', 'inn', 'year'],
                    skipEmptyLines: true
                }))
                .pipe(batchProcessor)
                .on('finish', () => {
                    console.log(`Импорт закупок завершен. Успешно: ${this.stats.procurements.success}, Ошибок: ${this.stats.procurements.error}`);
                    console.log(`Позиций закупок: ${this.stats.procurement_items.success}, Ошибок: ${this.stats.procurement_items.error}`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    async insertProcurementBatch(procurementsArray, procurementItems) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            if (procurementsArray.length > 0) {
                const procurementValues = procurementsArray.map((procurement, index) => {
                    const offset = index * 10;
                    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
                }).join(',');

                const flatProcurements = procurementsArray.flatMap(p => [
                    p.procurementId, p.userId, p.name, p.estimatedPrice, p.actualPrice,
                    p.status, p.procurementDate, p.publicationDate, p.organizationName, p.organizationInn
                ]);

                const procurementQuery = `
                    INSERT INTO procurements (procurement_id, user_id, name, estimated_price, actual_price, 
                    status, procurement_date, publication_date, organization_name, organization_inn) 
                    VALUES ${procurementValues}
                `;

                await client.query(procurementQuery, flatProcurements);

                procurementsArray.forEach(p => this.processedProcurements.add(p.procurementId));
            }

            if (procurementItems.length > 0) {
                const itemValues = procurementItems.map((_, index) => {
                    const offset = index * 4;
                    return `(uuid_generate_v4(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
                }).join(',');

                const itemQuery = `
                    INSERT INTO procurement_items (procurement_item_id, procurement_id, product_id, quantity, unit_price) 
                    VALUES ${itemValues}
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
        console.log('Импорт шаблонов...');
        
        const client = await this.pool.connect();
        try {
            const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
            const templatesData = [];
            const templateProductsData = [];

            await client.query('DELETE FROM template_products');
            await client.query('DELETE FROM procurement_templates');

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
                        this.parsePrice(String(templateData.avg_price || 0)) || 0
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

            const templateQuery = `
                INSERT INTO procurement_templates (template_id, name, description, size_range, 
                keywords, sample_size, avg_products_count, avg_price) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;

            for (const template of templatesData) {
                try {
                    await client.query(templateQuery, template);
                    this.stats.templates.success++;
                } catch (error) {
                    this.stats.templates.error++;
                    this.logError('importTemplates insert', error, template);
                }
            }

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
                    `;

                    try {
                        await client.query(productQuery, batch.flat());
                        this.stats.template_products.success += batch.length;
                    } catch (error) {
                        this.stats.template_products.error += batch.length;
                        this.logError('importTemplates products', error);
                    }
                }
            }

            console.log(`Импортировано ${this.stats.templates.success} шаблонов`);
            console.log(`Товаров в шаблонах: ${this.stats.template_products.success}`);
        } catch (error) {
            this.logError('importTemplates', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async createTestUser() {
        const client = await this.pool.connect();
        try {
            await client.query(`
                INSERT INTO users (user_id, email, password_hash, inn, company_name, full_name, phone_number) 
                VALUES (
                    '11111111-1111-1111-1111-111111111111',
                    'admin@company.com',
                    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdCvWfA5J8tGQW',
                    '1234567890',
                    'Тестовая компания ООО',
                    'Иван Иванов',
                    '+7-999-123-45-67'
                ) ON CONFLICT (user_id) DO NOTHING
            `);
            console.log('Тестовый пользователь создан/обновлен');
        } catch (error) {
            console.error('Ошибка создания тестового пользователя:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    printStats() {
        console.log('\nСТАТИСТИКА ИМПОРТА:');
        console.log(`Категории:           ${this.stats.categories.success}`);
        console.log(`Товары:              ${this.stats.products.success}`);
        console.log(`Закупки:             ${this.stats.procurements.success}`);
        console.log(`Позиции закупок:     ${this.stats.procurement_items.success}`);
        console.log(`Шаблоны:             ${this.stats.templates.success}`);
        console.log(`Товары в шаблонах:   ${this.stats.template_products.success}`);
    }

    async importAll() {
        const startTime = Date.now();
        
        try {
            await this.connect();
            await this.disableConstraints();
            await this.createTestUser();

            console.log('НАЧАЛО ИМПОРТА ДАННЫХ...\n');

            await this.importCategories();
            await this.importProcurements();
            await this.importTemplates();

            await this.enableConstraints();
            this.printStats();

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\nВСЕ ДАННЫЕ УСПЕШНО ИМПОРТИРОВАНЫ за ${duration} секунд!`);

        } catch (error) {
            console.error('Критическая ошибка при импорте:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

function validateRequiredFiles() {
    const requiredFiles = [
        'procurement_templates.json',
        'cleaned_procurement_data.csv'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('Отсутствуют необходимые файлы:');
        missingFiles.forEach(file => console.log(`   - ${file}`));
        return false;
    }

    return true;
}

async function main() {
    console.log('Запуск импорта данных в PostgreSQL...\n');

    if (!validateRequiredFiles()) {
        process.exit(1);
    }

    try {
        const importer = new ProcurementDataImporter();
        await importer.importAll();
    } catch (error) {
        console.error('Импорт завершен с ошибками');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProcurementDataImporter;