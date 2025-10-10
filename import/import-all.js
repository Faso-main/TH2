// data-importer.js
const { Client } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

class ProcurementDataImporter {
    constructor() {
        this.client = new Client({
            user: 'store_app1',
            host: 'localhost',
            database: 'template0',
            password: '1234',
            port: 5432,
        });
        
        this.stats = {
            categories: 0,
            products: 0,
            procurements: 0,
            procurement_items: 0,
            templates: 0,
            template_products: 0
        };
    }

    async connect() {
        await this.client.connect();
        console.log('✅ Подключение к БД установлено');
    }

    async disconnect() {
        await this.client.end();
        console.log('✅ Подключение к БД закрыто');
    }

    async disableConstraints() {
        await this.client.query("SET session_replication_role = 'replica';");
    }

    async enableConstraints() {
        await this.client.query("SET session_replication_role = 'origin';");
    }

    async importCategories() {
        console.log('📁 Импорт категорий...');
        
        const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
        const categories = [];

        for (const [templateKey, templateData] of Object.entries(templates)) {
            categories.push([
                templateKey, // Используем templateKey как ID категории
                null,
                templateData.name,
                `Категория из ${templateData.name}`,
                templateData.keywords || [],
                1
            ]);
        }

        const query = `
            INSERT INTO categories (category_id, parent_category_id, name, description, keywords, level) 
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

        for (const category of categories) {
            await this.client.query(query, category);
        }

        this.stats.categories = categories.length;
        console.log(`✅ Импортировано ${categories.length} категорий`);
    }

    async importProducts() {
        console.log('📁 Импорт товаров...');
        
        return new Promise((resolve, reject) => {
            const products = [];
            let batchCount = 0;

            fs.createReadStream('344608_СТЕ.csv')
                .pipe(csv())
                .on('data', (row) => {
                    const productId = row.product_id || row.id;
                    if (!productId) return;

                    products.push([
                        productId,
                        row.name || row.product_name || `Товар ${productId}`,
                        row.description || null,
                        row.category_id || null,
                        row.manufacturer || null,
                        row.unit_of_measure || null,
                        row.specifications ? JSON.parse(row.specifications) : null,
                        parseFloat(row.average_price) || null,
                        true,
                        'catalog'
                    ]);

                    // Вставляем пачками по 1000 записей
                    if (products.length >= 1000) {
                        this.insertProductBatch([...products]);
                        products.length = 0;
                        batchCount++;
                        console.log(`✅ Обработано ${batchCount * 1000} товаров...`);
                    }
                })
                .on('end', async () => {
                    // Оставшиеся записи
                    if (products.length > 0) {
                        await this.insertProductBatch(products);
                        batchCount++;
                    }
                    
                    this.stats.products = batchCount * 1000 + products.length;
                    console.log(`✅ Импортировано ${this.stats.products} товаров`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    async insertProductBatch(products) {
        const values = products.map((_, index) => {
            const offset = index * 10;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
        }).join(',');

        const query = `
            INSERT INTO products (product_id, name, description, category_id, manufacturer, 
            unit_of_measure, specifications, average_price, is_available, source_system) 
            VALUES ${values}
        `;

        const flatParams = products.flat();
        await this.client.query(query, flatParams);
    }

    async importProcurements() {
        console.log('📁 Импорт закупок...');
        
        return new Promise((resolve, reject) => {
            const procurements = [];
            const procurementItems = [];
            let procurementCount = 0;

            fs.createReadStream('cleaned_procurement_data.csv')
                .pipe(csv())
                .on('data', (row) => {
                    const procurementId = row.procurement_id || `proc_${procurementCount}`;
                    
                    // Добавляем закупку
                    procurements.push([
                        procurementId,
                        '11111111-1111-1111-1111-111111111111', // test user
                        row.procurement_name || `Закупка ${procurementCount}`,
                        parseFloat(row.estimated_price) || 0,
                        parseFloat(row.estimated_price) || 0,
                        'completed',
                        row.date ? new Date(row.date) : null,
                        row.publication_date ? new Date(row.publication_date) : null,
                        row.organization || 'Неизвестно',
                        row.inn || ''
                    ]);

                    // Обрабатываем товары в закупке
                    if (row.product_ids) {
                        const productIds = String(row.product_ids).split(',');
                        productIds.forEach(productId => {
                            const cleanProductId = productId.trim();
                            if (cleanProductId && cleanProductId !== 'nan') {
                                const price = parseFloat(row.estimated_price) || 0;
                                const unitPrice = price / productIds.length;
                                
                                procurementItems.push([
                                    procurementId,
                                    cleanProductId,
                                    1,
                                    unitPrice
                                ]);
                            }
                        });
                    }

                    procurementCount++;

                    // Вставляем пачками
                    if (procurements.length >= 500) {
                        this.insertProcurementBatch([...procurements], [...procurementItems]);
                        procurements.length = 0;
                        procurementItems.length = 0;
                        console.log(`✅ Обработано ${procurementCount} закупок...`);
                    }
                })
                .on('end', async () => {
                    // Оставшиеся записи
                    if (procurements.length > 0) {
                        await this.insertProcurementBatch(procurements, procurementItems);
                    }
                    
                    this.stats.procurements = procurementCount;
                    this.stats.procurement_items = procurementItems.length;
                    console.log(`✅ Импортировано ${procurementCount} закупок`);
                    console.log(`✅ Импортировано ${procurementItems.length} позиций в закупках`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    async insertProcurementBatch(procurements, procurementItems) {
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
            `;

            await this.client.query(procurementQuery, procurements.flat());
        }

        // Вставляем позиции закупок
        if (procurementItems.length > 0) {
            const itemValues = procurementItems.map((_, index) => {
                const offset = index * 4;
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
            }).join(',');

            const itemQuery = `
                INSERT INTO procurement_items (procurement_id, product_id, quantity, unit_price) 
                VALUES ${itemValues}
            `;

            await this.client.query(itemQuery, procurementItems.flat());
        }
    }

    async importTemplates() {
        console.log('📁 Импорт шаблонов...');
        
        const templates = JSON.parse(fs.readFileSync('procurement_templates.json', 'utf8'));
        const templatesData = [];
        const templateProductsData = [];

        for (const [templateKey, templateData] of Object.entries(templates)) {
            // Шаблоны
            templatesData.push([
                templateKey,
                templateData.name,
                `Шаблон ${templateData.name}`,
                templateData.size_range || '',
                templateData.keywords || [],
                templateData.sample_size || 0,
                templateData.avg_products_per_procurement || 0,
                templateData.avg_price || 0
            ]);

            // Товары в шаблонах
            if (templateData.typical_products) {
                templateData.typical_products.forEach((productId, position) => {
                    const frequency = templateData.product_frequencies?.[productId] || 0;
                    templateProductsData.push([
                        templateKey,
                        productId,
                        frequency,
                        position
                    ]);
                });
            }
        }

        // Вставляем шаблоны
        const templateQuery = `
            INSERT INTO procurement_templates (template_id, name, description, size_range, 
            keywords, sample_size, avg_products_count, avg_price) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        for (const template of templatesData) {
            await this.client.query(templateQuery, template);
        }

        // Вставляем товары шаблонов
        if (templateProductsData.length > 0) {
            const productValues = templateProductsData.map((_, index) => {
                const offset = index * 4;
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
            }).join(',');

            const productQuery = `
                INSERT INTO template_products (template_id, product_id, frequency, position) 
                VALUES ${productValues}
            `;

            await this.client.query(productQuery, templateProductsData.flat());
        }

        this.stats.templates = templatesData.length;
        this.stats.template_products = templateProductsData.length;
        console.log(`✅ Импортировано ${templatesData.length} шаблонов`);
        console.log(`✅ Импортировано ${templateProductsData.length} товаров в шаблонах`);
    }

    async createTestUser() {
        console.log('👤 Создание тестового пользователя...');
        
        await this.client.query(`
            INSERT INTO users (user_id, email, password_hash, company_name) 
            VALUES ('11111111-1111-1111-1111-111111111111', 'test@company.ru', 'hash', 'Тестовая компания')
            ON CONFLICT (user_id) DO NOTHING;
        `);
    }

    printStats() {
        console.log('\n📊 СТАТИСТИКА ИМПОРТА:');
        console.log('='.repeat(40));
        console.log(`Категории:           ${this.stats.categories.toLocaleString()}`);
        console.log(`Товары:              ${this.stats.products.toLocaleString()}`);
        console.log(`Закупки:             ${this.stats.procurements.toLocaleString()}`);
        console.log(`Позиции закупок:     ${this.stats.procurement_items.toLocaleString()}`);
        console.log(`Шаблоны:             ${this.stats.templates.toLocaleString()}`);
        console.log(`Товары в шаблонах:   ${this.stats.template_products.toLocaleString()}`);
        console.log('='.repeat(40));
    }

    async importAll() {
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

            console.log('\n🎉 ВСЕ ДАННЫЕ УСПЕШНО ИМПОРТИРОВАНЫ!');

        } catch (error) {
            console.error('❌ Ошибка при импорте:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// Запуск импорта
async function main() {
    // Проверяем существование файлов
    const requiredFiles = [
        'procurement_templates.json',
        '344608_СТЕ.csv', 
        'cleaned_procurement_data.csv'
    ];

    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            console.error(`❌ Файл не найден: ${file}`);
            console.log('Убедитесь, что файлы находятся в правильных папках:');
            console.log('- procurement_templates.json');
            console.log('- 344608_СТЕ.csv');
            console.log('- cleaned_procurement_data.csv');
            process.exit(1);
        }
    }

    const importer = new ProcurementDataImporter();
    await importer.importAll();
}

// Запуск если файл выполняется напрямую
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProcurementDataImporter;