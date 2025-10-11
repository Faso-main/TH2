// check-import.js
const { Client } = require('pg');

async function checkImportedData() {
    const client = new Client({
        user: 'store_app1',
        host: 'localhost',
        database: 'pc_db',
        password: '1234',
        port: 5432,
    });

    try {
        await client.connect();
        console.log('✅ Подключение к БД установлено\n');

        // Проверяем количество записей в каждой таблице
        const tables = [
            'users',
            'categories', 
            'products',
            'procurements',
            'procurement_items',
            'procurement_templates',
            'template_products'
        ];

        for (const table of tables) {
            const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`📊 ${table}: ${parseInt(result.rows[0].count).toLocaleString()} записей`);
        }

        // Показываем примеры данных
        console.log('\n🔍 Примеры товаров:');
        const products = await client.query('SELECT product_id, name, average_price FROM products LIMIT 5');
        products.rows.forEach(product => {
            console.log(`   ${product.product_id}: "${product.name}" - ${product.average_price} руб.`);
        });

        console.log('\n🔍 Примеры категорий:');
        const categories = await client.query('SELECT category_id, name FROM categories LIMIT 5');
        categories.rows.forEach(category => {
            console.log(`   ${category.category_id}: "${category.name}"`);
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await client.end();
        console.log('\n✅ Проверка завершена');
    }
}

checkImportedData();