// analyze-procurements.js
const fs = require('fs');
const csv = require('csv-parser');

function analyzeProcurements(filename) {
    console.log(`Анализируем файл закупок: ${filename}`);
    
    let rowCount = 0;
    let headers = [];
    let sampleData = [];

    fs.createReadStream(filename)
        .pipe(csv({
            headers: false,
            skipEmptyLines: true
        }))
        .on('headers', (fileHeaders) => {
            headers = fileHeaders;
            console.log('Найдены колонки:');
            headers.forEach((header, index) => {
                console.log(`   Колонка ${index}: "${header}"`);
            });
        })
        .on('data', (row) => {
            rowCount++;
            if (rowCount <= 10) { 
                sampleData.push(row);
            }
            
            if (rowCount <= 3) { 
                console.log(`\nСтрока ${rowCount}:`);
                Object.keys(row).forEach(key => {
                    console.log(`   Колонка ${key}: "${row[key]}"`);
                });
            }
        })
        .on('end', () => {
            console.log(`Всего строк в файле: ${rowCount}`);
            console.log(`Всего колонок: ${headers.length}`);
            
            console.log('\nПредполагаемая структура данных:');
            if (sampleData.length > 0) {
                const firstRow = sampleData[0];
                
                if (firstRow['0']) {
                    console.log(`   Колонка 0 (ID закупки): "${firstRow['0'].substring(0, 50)}..."`);
                }
                
                Object.keys(firstRow).forEach(key => {
                    const value = firstRow[key];
                    if (value && key !== '0') {
                        console.log(`   Колонка ${key}: "${value.substring(0, 100)}..."`);
                    }
                });
            }
            
            console.log('\nПроверяем разделитель...');
            if (sampleData.length > 0) {
                const firstLine = Object.values(sampleData[0]).join('');
                if (firstLine.includes(';')) {
                    console.log('Разделитель: точка с запятой (;)');
                } else if (firstLine.includes(',')) {
                    console.log('Разделитель: запятая (,)');
                } else {
                    console.log('Неизвестный разделитель');
                }
            }
        })
        .on('error', (error) => {
            console.error('Ошибка чтения файла:', error.message);
        });
}

// Также добавим проверку через обычное чтение файла
function quickCheck(filename) {
    console.log(`\nБыстрая проверка файла: ${filename}`);
    
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const lines = data.split('\n');
        
        console.log(`Всего строк: ${lines.length}`);
        console.log(`Размер файла: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\nПервые 3 строки:');
        lines.slice(0, 3).forEach((line, index) => {
            console.log(`   Строка ${index + 1}: ${line.substring(0, 200)}...`);
        });
        
        // Анализируем первую строку на предмет заголовков
        if (lines.length > 0) {
            const firstLine = lines[0];
            console.log('\nПервая строка (возможные заголовки):');
            console.log(`   ${firstLine}`);
        }
        
    } catch (error) {
        console.error('Ошибка чтения файла:', error.message);
    }
}

// Запускаем анализ
const filename = 'cleaned_procurement_data.csv';

if (fs.existsSync(filename)) {
    analyzeProcurements(filename);
    quickCheck(filename);
} else {
    console.log('Файл закупок не найден:', filename);
    console.log('Доступные файлы:');
    fs.readdirSync('.').forEach(file => {
        if (file.includes('procurement') || file.includes('закуп')) {
            console.log(`   - ${file}`);
        }
    });
}