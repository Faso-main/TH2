const fs = require('fs');
const csv = require('csv-parser');

function analyzeCSV(filename) {
    console.log(`🔍 Анализируем файл: ${filename}`);
    console.log('='.repeat(50));
    
    let rowCount = 0;

    fs.createReadStream(filename)
        .pipe(csv({
            headers: ['product_id', 'category', 'name', 'price', 'available', 'specifications'],
            separator: ';', // Указываем правильный разделитель
            skipEmptyLines: true
        }))
        .on('data', (row) => {
            rowCount++;
            if (rowCount <= 5) { // Показываем только первые 5 строк
                console.log(`\n📝 Строка ${rowCount}:`);
                console.log(`   product_id: "${row.product_id}"`);
                console.log(`   category: "${row.category}"`);
                console.log(`   name: "${row.name}"`);
                console.log(`   price: "${row.price}"`);
                console.log(`   available: "${row.available}"`);
                console.log(`   specifications: "${row.specifications}"`);
            }
        })
        .on('end', () => {
            console.log('\n' + '='.repeat(50));
            console.log(`📊 Всего строк в файле: ${rowCount}`);
        })
        .on('error', (error) => {
            console.error('❌ Ошибка чтения файла:', error.message);
        });
}

// Запускаем анализ
analyzeCSV('344608_СТЕ.csv');