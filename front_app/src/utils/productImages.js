// src/utils/productImages.js
export const generateProductImage = (productName, color = 'd01a1a') => {
  // Очищаем название от специальных символов
  const cleanName = productName.replace(/[^\w\s]/gi, '').substring(0, 25);
  
  const svg = `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad${color}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#${getDarkerColor(color)};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad${color})"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="14" 
        fill="white" 
        text-anchor="middle" 
        dominant-baseline="middle"
        font-weight="600"
        width="180"
      >
        ${cleanName}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Функция для получения более темного оттенка
const getDarkerColor = (hex) => {
  const num = parseInt(hex, 16);
  const amt = 30;
  const R = (num >> 16) - amt;
  const G = ((num >> 8) & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  return (
    (0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
};

// Цвета для разных категорий товаров
export const getCategoryColor = (categoryName) => {
  if (!categoryName) return 'd01a1a';
  
  const category = categoryName.toLowerCase();
  
  // Основные цвета из вашей палитры
  if (category.includes('смартфон') || category.includes('электроника')) return 'd01a1a'; // primary red
  if (category.includes('ноутбук') || category.includes('компьютер')) return '000000'; // secondary black
  if (category.includes('телевизор') || category.includes('аудио')) return '1e293b'; // text primary dark
  if (category.includes('холодильник') || category.includes('стиральная')) return '475569'; // text secondary
  if (category.includes('джинсы') || category.includes('одежда')) return '94a3b8'; // text light
  if (category.includes('обувь') || category.includes('кроссовки')) return 'c4c4c4'; // accent gray
  if (category.includes('диван') || category.includes('мебель')) return '000000'; // black
  if (category.includes('кофемашина') || category.includes('кухонная')) return 'd01a1a'; // primary red
  
  return 'd01a1a'; // primary red по умолчанию
};