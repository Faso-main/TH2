# main.py - Улучшенная версия с устранением дубликатов
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import asyncpg
import os
from datetime import datetime
import logging
from collections import defaultdict, Counter
import math
import re

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart Procurement Recommendations API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://faso312.ru"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class RecommendationRequest(BaseModel):
    user_id: str
    limit: int = 15

class RecommendationResponse(BaseModel):
    user_id: str
    recommendations_count: int
    recommendations: List[Dict]
    engine: str
    generated_at: str

# Database Service
class DatabaseService:
    def __init__(self):
        self.pool = None
        
    async def connect(self):
        """Подключение к PostgreSQL"""
        try:
            self.pool = await asyncpg.create_pool(
                user='store_app1',
                host='localhost',
                database='pc_db',
                password='1234',
                port=5432,
                min_size=3,
                max_size=10
            )
            logger.info("Connected to PostgreSQL database pc_db")
            
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    async def get_user_procurements(self, user_id: str) -> List[Dict]:
        """Получить историю закупок пользователя"""
        try:
            query = """
            SELECT 
                p.procurement_id,
                pi.product_id,
                pr.name as product_name,
                pr.category_id,
                c.name as category_name,
                pi.quantity,
                pi.unit_price,
                pr.average_price,
                p.procurement_date
            FROM procurements p
            JOIN procurement_items pi ON p.procurement_id = pi.procurement_id
            JOIN products pr ON pi.product_id = pr.product_id
            LEFT JOIN categories c ON pr.category_id = c.category_id
            WHERE p.user_id = $1
            ORDER BY p.procurement_date DESC
            LIMIT 1000
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, user_id)
            
            procurements = []
            for row in rows:
                procurements.append({
                    'procurement_id': row['procurement_id'],
                    'product_id': row['product_id'],
                    'product_name': row['product_name'],
                    'category_id': row['category_id'],
                    'category_name': row['category_name'] or 'Без категории',
                    'quantity': row['quantity'] or 1,
                    'unit_price': float(row['unit_price']) if row['unit_price'] else 0,
                    'average_price': float(row['average_price']) if row['average_price'] else 0,
                })
            
            logger.info(f"Loaded {len(procurements)} procurement items for user {user_id}")
            return procurements
            
        except Exception as e:
            logger.error(f"Error getting user procurements: {e}")
            return []
    
    async def get_available_products(self, limit: int = 20000) -> List[Dict]:
        """Получить доступные товары для рекомендаций с улучшенной фильтрацией"""
        try:
            query = """
            SELECT 
                p.product_id,
                p.name,
                p.description,
                p.category_id,
                c.name as category_name,
                p.manufacturer,
                p.average_price,
                p.unit_of_measure,
                p.specifications,
                p.is_available,
                (SELECT COUNT(*) FROM procurement_items pi WHERE pi.product_id = p.product_id) as purchase_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.is_available = true 
            AND p.average_price > 0
            AND p.name IS NOT NULL
            AND LENGTH(TRIM(p.name)) > 5
            ORDER BY purchase_count DESC, p.average_price DESC
            LIMIT $1
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
            
            products = []
            seen_names = set()  # Для устранения дубликатов
            
            for row in rows:
                # Нормализуем название для устранения дубликатов
                normalized_name = self._normalize_product_name(row['name'])
                
                # Пропускаем дубликаты
                if normalized_name in seen_names:
                    continue
                seen_names.add(normalized_name)
                
                # Улучшаем категоризацию
                category_name = self._improve_category(row['category_name'], row['name'])
                
                products.append({
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'normalized_name': normalized_name,
                    'description': row['description'],
                    'category_id': row['category_id'],
                    'category_name': category_name,
                    'manufacturer': row['manufacturer'],
                    'average_price': float(row['average_price']),
                    'unit_of_measure': row['unit_of_measure'],
                    'specifications': row['specifications'],
                    'is_available': row['is_available'],
                    'purchase_count': row['purchase_count'] or 0
                })
            
            # Логируем статистику
            category_dist = Counter(p['category_name'] for p in products)
            logger.info(f"Loaded {len(products)} unique available products")
            logger.info(f"Category distribution: {dict(category_dist.most_common(8))}")
            
            return products
            
        except Exception as e:
            logger.error(f"Error getting available products: {e}")
            return []
    
    def _normalize_product_name(self, name: str) -> str:
        """Нормализация названия товара для устранения дубликатов"""
        if not name:
            return ""
        
        # Приводим к нижнему регистру
        normalized = name.lower().strip()
        
        # Удаляем лишние пробелы
        normalized = re.sub(r'\s+', ' ', normalized)
        
        # Удаляем размеры упаковки в скобках (100 шт/уп и т.д.)
        normalized = re.sub(r'\s*\(\s*\d+\s*шт/\s*уп\s*\)', '', normalized)
        normalized = re.sub(r'\s*\d+\s*шт/\s*уп\.?', '', normalized)
        
        # Удаляем повторяющиеся характеристики
        normalized = re.sub(r'\s*\(\s*[^)]*\d+\s*мм\s*[^)]*\)', '', normalized)
        
        return normalized.strip()
    
    def _improve_category(self, current_category: str, product_name: str) -> str:
        """Улучшение категоризации на основе названия товара"""
        if current_category and current_category != 'Без категории':
            return current_category
        
        name_lower = product_name.lower()
        
        # Автоматическое определение категории по ключевым словам
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'ластик', 'линейка', 'блокнот', 'тетрадь', 'скрепка', 'степлер', 'дырокол'],
            'Бумажная продукция': ['бумага', 'пленка', 'ламинирован', 'картридж', 'тонер', 'блок для записей'],
            'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'ламинатор', 'брошюратор'],
            'Расходные материалы': ['картридж', 'тонер', 'пленка', 'чернила', 'бумага'],
            'Электроника': ['usb', 'кабель', 'разветвитель', 'роутер', 'наушник', 'колонка'],
            'Хозтовары': ['мыло', 'туалетная', 'бумага', 'моющее', 'чистящ', 'перчатк'],
            'Мебель': ['стол', 'стул', 'кресло', 'шкаф', 'полка', 'стеллаж']
        }
        
        for category, keywords in category_keywords.items():
            if any(keyword in name_lower for keyword in keywords):
                return category
        
        return 'Офисные товары'  # Дефолтная категория вместо "Без категории"

# Smart Recommendation Engine
class SmartRecommendationEngine:
    def __init__(self, db_service):
        self.db = db_service
        
    async def generate_recommendations(self, user_id: str, limit: int = 15) -> List[Dict]:
        """Генерация умных рекомендаций"""
        
        # 1. Получаем историю пользователя
        user_procurements = await self.db.get_user_procurements(user_id)
        
        # 2. Получаем доступные товары
        available_products = await self.db.get_available_products(15000)
        
        # 3. Анализируем профиль пользователя
        user_profile = self._analyze_user_profile(user_procurements)
        
        # 4. Генерируем рекомендации
        recommendations = []
        purchased_products = set(p['product_id'] for p in user_procurements)
        seen_recommendations = set()  # Для устранения дубликатов
        
        for product in available_products:
            # Пропускаем уже купленные
            if product['product_id'] in purchased_products:
                continue
            
            # Пропускаем дубликаты по нормализованному названию
            if product['normalized_name'] in seen_recommendations:
                continue
            
            score_data = self._calculate_product_score(product, user_profile)
            
            if score_data['total_score'] > 0.25:  # Повышаем порог для лучшего качества
                recommendation = {
                    'product_id': product['product_id'],
                    'product_name': product['name'],
                    'product_category': product['category_name'],
                    'total_score': round(score_data['total_score'], 4),
                    'component_scores': score_data['components'],
                    'explanation': self._generate_smart_explanation(product, user_profile, score_data),
                    'price_range': {
                        'avg': product['average_price'],
                        'min': product['average_price'] * 0.8,
                        'max': product['average_price'] * 1.2,
                        'source': 'database_real'
                    },
                    'in_catalog': True,
                    'is_available': True,
                    'real_data': True,
                    'purchase_count': product['purchase_count']
                }
                
                recommendations.append(recommendation)
                seen_recommendations.add(product['normalized_name'])
        
        # Сортируем и ограничиваем
        recommendations.sort(key=lambda x: x['total_score'], reverse=True)
        final_recommendations = recommendations[:limit]
        
        if final_recommendations:
            scores = [r['total_score'] for r in final_recommendations]
            score_range = f"{max(scores):.3f}-{min(scores):.3f}"
            avg_score = sum(scores) / len(scores)
        else:
            score_range = "0-0"
            avg_score = 0
            
        logger.info(f"User {user_id}: {len(final_recommendations)} unique recommendations, scores: {score_range}, avg: {avg_score:.3f}")
        
        return final_recommendations
    
    def _analyze_user_profile(self, procurements: List[Dict]) -> Dict:
        """Глубокий анализ профиля пользователя"""
        profile = {
            'purchased_products': set(),
            'categories': Counter(),
            'price_points': [],
            'total_spent': 0,
            'total_items': 0,
            'preferred_price_range': None,
            'category_affinity': {},
            'purchase_patterns': {}
        }
        
        if not procurements:
            return profile
        
        # Анализ покупок
        for proc in procurements:
            product_id = proc['product_id']
            category = proc['category_name']
            price = proc['unit_price'] or proc['average_price']
            quantity = proc['quantity']
            
            profile['purchased_products'].add(product_id)
            profile['categories'][category] += quantity
            profile['total_spent'] += price * quantity
            profile['total_items'] += quantity
            
            # Собираем ценовые точки
            for _ in range(quantity):
                profile['price_points'].append(price)
        
        # Анализ ценовых предпочтений
        if profile['price_points']:
            sorted_prices = sorted(profile['price_points'])
            n = len(sorted_prices)
            profile['preferred_price_range'] = {
                'min': sorted_prices[0],
                'max': sorted_prices[-1],
                'avg': sum(sorted_prices) / n,
                'median': sorted_prices[n // 2],
                'q1': sorted_prices[n // 4],
                'q3': sorted_prices[3 * n // 4]
            }
        
        # Анализ категориальных предпочтений
        if profile['categories']:
            total_items = profile['total_items']
            for category, count in profile['categories'].items():
                profile['category_affinity'][category] = count / total_items
        
        logger.info(f"👤 User profile: {profile['total_items']} items, {len(profile['categories'])} categories, "
                   f"avg price: {profile['preferred_price_range']['avg'] if profile['preferred_price_range'] else 0:.0f}₽")
        
        return profile
    
    def _calculate_product_score(self, product: Dict, user_profile: Dict) -> Dict:
        """Расчет скора с улучшенной логикой"""
        components = {}
        
        # 1. Категориальное сходство (40%)
        cat_affinity = user_profile['category_affinity'].get(product['category_name'], 0)
        if cat_affinity > 0.1:  # Пользователь активно покупает в этой категории
            components['category_match'] = min(cat_affinity * 3.0, 1.0) * 0.4
        elif cat_affinity > 0:   # Есть минимальный интерес
            components['category_match'] = 0.3 * 0.4
        else:                    # Новая категория
            components['category_match'] = 0.1 * 0.4
        
        # 2. Ценовая совместимость (30%)
        price_stats = user_profile['preferred_price_range']
        if price_stats:
            product_price = product['average_price']
            avg_price = price_stats['avg']
            
            if avg_price > 0:
                # Мягкое сравнение с учетом квартилей
                if price_stats['q1'] <= product_price <= price_stats['q3']:
                    components['price_fit'] = 0.9 * 0.3  # В оптимальном диапазоне
                elif price_stats['min'] <= product_price <= price_stats['max']:
                    components['price_fit'] = 0.7 * 0.3  # В общем диапазоне
                else:
                    # Вне диапазона - плавное уменьшение
                    price_diff = min(abs(product_price - price_stats['min']), 
                                   abs(product_price - price_stats['max'])) / avg_price
                    components['price_fit'] = max(0.3 - price_diff, 0.1) * 0.3
            else:
                components['price_fit'] = 0.5 * 0.3
        else:
            components['price_fit'] = 0.3 * 0.3
        
        # 3. Популярность и качество (30%)
        purchase_count = product.get('purchase_count', 0)
        
        # Логарифмическая популярность
        if purchase_count > 100:
            popularity = 0.9
        elif purchase_count > 10:
            popularity = 0.7
        elif purchase_count > 0:
            popularity = 0.4
        else:
            popularity = 0.1
        
        # Качество данных
        data_quality = 0.0
        if len(product['name']) > 20:  # Подробное название
            data_quality += 0.05
        if product['manufacturer']:
            data_quality += 0.03
        if product['description']:
            data_quality += 0.02
        
        components['popularity_quality'] = (popularity + data_quality) * 0.3
        
        # Общий score
        total_score = sum(components.values())
        
        return {
            'total_score': min(total_score, 1.0),
            'components': {k: round(v, 4) for k, v in components.items()}
        }
    
    def _generate_smart_explanation(self, product: Dict, user_profile: Dict, score_data: Dict) -> str:
        """Умное объяснение рекомендации"""
        explanations = []
        components = score_data['components']
        
        # Категориальное объяснение
        cat_affinity = user_profile['category_affinity'].get(product['category_name'], 0)
        if cat_affinity > 0.2:
            explanations.append("часто покупаете в этой категории")
        elif cat_affinity > 0.05:
            explanations.append("в сфере ваших интересов")
        
        # Ценовое объяснение
        price_fit = components['price_fit'] / 0.3  # Денормализуем
        if price_fit > 0.8:
            explanations.append("идеально по цене")
        elif price_fit > 0.6:
            explanations.append("отлично вписывается в бюджет")
        elif price_fit > 0.4:
            explanations.append("доступный вариант")
        
        # Объяснение популярности
        purchase_count = product.get('purchase_count', 0)
        if purchase_count > 100:
            explanations.append("хит продаж")
        elif purchase_count > 50:
            explanations.append("популярный товар")
        elif purchase_count > 10:
            explanations.append("востребованный выбор")
        
        if explanations:
            return explanations
        else:
            return "Интересное предложение из каталога"

# Global services
db_service = DatabaseService()
recommendation_engine = SmartRecommendationEngine(db_service)

# Startup
@app.on_event("startup")
async def startup_event():
    await db_service.connect()
    logger.info("Smart recommendation engine initialized")

# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Smart Procurement Recommendations API", 
        "status": "running", 
        "version": "4.0-smart"
    }

@app.get("/health")
async def health_check():
    try:
        async with db_service.pool.acquire() as conn:
            stats = await conn.fetchrow("""
                SELECT 
                    COUNT(*) as total_products,
                    COUNT(CASE WHEN is_available = true AND average_price > 0 THEN 1 END) as available_products
                FROM products
            """)
            
        return {
            "status": "healthy",
            "database": "connected", 
            "total_products": stats['total_products'],
            "available_products": stats['available_products'],
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    try:
        logger.info(f"Getting SMART recommendations for user: {request.user_id}")
        
        recommendations = await recommendation_engine.generate_recommendations(
            user_id=request.user_id,
            limit=request.limit
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="smart_v4",
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Совместимость
@app.get("/api/ml/health")
async def ml_health():
    return await health_check()

@app.post("/api/ml/recommendations")
async def ml_recommendations(request: RecommendationRequest):
    return await get_recommendations(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")