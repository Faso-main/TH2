# main.py - Исправленная версия для реальных данных
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncpg
import os
from datetime import datetime
import logging
from collections import defaultdict, Counter
import math

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Procurement Recommendations API")

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
            logger.info("✅ Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise
    
    async def get_user_profile(self, user_id: str) -> Dict:
        """Получить полный профиль пользователя с историей закупок"""
        try:
            # История закупок пользователя
            procurements_query = """
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
                rows = await conn.fetch(procurements_query, user_id)
            
            procurements = []
            purchased_products = set()
            category_stats = Counter()
            total_spent = 0
            price_points = []
            
            for row in rows:
                price = float(row['unit_price']) if row['unit_price'] else float(row['average_price']) if row['average_price'] else 0
                quantity = row['quantity'] or 1
                
                procurement_data = {
                    'procurement_id': row['procurement_id'],
                    'product_id': row['product_id'],
                    'product_name': row['product_name'],
                    'category_id': row['category_id'],
                    'category_name': row['category_name'] or 'Без категории',
                    'quantity': quantity,
                    'unit_price': price,
                    'average_price': float(row['average_price']) if row['average_price'] else 0,
                }
                procurements.append(procurement_data)
                
                purchased_products.add(row['product_id'])
                category_stats[row['category_name'] or 'Без категории'] += 1
                total_spent += price * quantity
                if price > 0:
                    price_points.append(price)
            
            # Вычисляем статистику по ценам
            price_stats = {}
            if price_points:
                price_stats = {
                    'avg_price': sum(price_points) / len(price_points),
                    'min_price': min(price_points),
                    'max_price': max(price_points),
                    'median_price': sorted(price_points)[len(price_points) // 2]
                }
            
            profile = {
                'procurements': procurements,
                'purchased_products': purchased_products,
                'category_stats': dict(category_stats),
                'price_stats': price_stats,
                'total_spent': total_spent,
                'total_procurements': len(procurements),
                'preferred_categories': [cat for cat, count in category_stats.most_common(5)]
            }
            
            logger.info(f"📊 User {user_id}: {len(procurements)} purchases, {len(purchased_products)} unique products, {len(category_stats)} categories")
            return profile
            
        except Exception as e:
            logger.error(f"Error getting user profile: {e}")
            return self._get_empty_profile()
    
    def _get_empty_profile(self):
        """Пустой профиль для пользователей без истории"""
        return {
            'procurements': [],
            'purchased_products': set(),
            'category_stats': {},
            'price_stats': {},
            'total_spent': 0,
            'total_procurements': 0,
            'preferred_categories': []
        }
    
    async def get_recommendation_candidates(self, limit: int = 50000) -> List[Dict]:
        """Получить товары для рекомендаций - ТОЛЬКО доступные и с ценами"""
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
                -- Считаем популярность на основе истории закупок
                (SELECT COUNT(*) FROM procurement_items pi WHERE pi.product_id = p.product_id) as purchase_count,
                -- Определяем основную категорию (если есть родительская)
                CASE 
                    WHEN c.parent_category_id IS NOT NULL THEN 
                        (SELECT name FROM categories WHERE category_id = c.parent_category_id)
                    ELSE c.name
                END as main_category
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.is_available = true 
            AND p.average_price > 0  -- Только товары с ценами
            AND p.name IS NOT NULL
            AND LENGTH(TRIM(p.name)) > 5  -- Только с нормальными названиями
            ORDER BY 
                purchase_count DESC,
                p.average_price DESC
            LIMIT $1
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
            
            products = []
            for row in rows:
                # Исправляем категории для товаров без категории
                category_name = row['category_name'] or 'Без категории'
                main_category = row['main_category'] or category_name
                
                products.append({
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'description': row['description'],
                    'category_id': row['category_id'],
                    'category_name': category_name,
                    'main_category': main_category,
                    'manufacturer': row['manufacturer'],
                    'average_price': float(row['average_price']),
                    'unit_of_measure': row['unit_of_measure'],
                    'specifications': row['specifications'],
                    'is_available': row['is_available'],
                    'purchase_count': row['purchase_count'] or 0
                })
            
            logger.info(f"📦 Loaded {len(products)} available products with prices")
            
            # Логируем распределение по категориям
            category_dist = Counter(p['main_category'] for p in products)
            logger.info(f"📊 Category distribution: {dict(category_dist.most_common(10))}")
            
            return products
            
        except Exception as e:
            logger.error(f"Error getting recommendation candidates: {e}")
            return []
    
    async def get_user_procurements_count(self, user_id: str) -> int:
        """Получить количество закупок пользователя"""
        try:
            query = "SELECT COUNT(*) FROM procurements WHERE user_id = $1"
            async with self.pool.acquire() as conn:
                count = await conn.fetchval(query, user_id)
            return count
        except:
            return 0

# Smart Recommendation Engine
class RecommendationEngine:
    def __init__(self, db_service):
        self.db = db_service
        
    async def generate_recommendations(self, user_id: str, limit: int = 15) -> List[Dict]:
        """Генерация персонализированных рекомендаций"""
        
        # 1. Получаем профиль пользователя
        user_profile = await self.db.get_user_profile(user_id)
        
        # 2. Получаем кандидатов для рекомендаций
        candidates = await self.db.get_recommendation_candidates(20000)  # Ограничиваем для производительности
        
        # 3. Генерируем рекомендации
        recommendations = []
        
        for product in candidates:
            # Пропускаем уже купленные товары
            if product['product_id'] in user_profile['purchased_products']:
                continue
            
            # Вычисляем score
            score_data = self._calculate_product_score(product, user_profile)
            
            if score_data['total_score'] > 0.15:  # Минимальный порог
                recommendations.append({
                    'product_id': product['product_id'],
                    'product_name': product['name'],
                    'product_category': product['main_category'],
                    'total_score': round(score_data['total_score'], 4),
                    'component_scores': score_data['components'],
                    'explanation': self._generate_explanation(product, user_profile, score_data),
                    'price_range': {
                        'avg': product['average_price'],
                        'min': product['average_price'] * 0.7,
                        'max': product['average_price'] * 1.3,
                        'source': 'database'
                    },
                    'in_catalog': True,
                    'is_available': True,
                    'real_price': product['average_price'],
                    'purchase_count': product['purchase_count']
                })
        
        # Сортируем по score и ограничиваем
        recommendations.sort(key=lambda x: x['total_score'], reverse=True)
        final_recommendations = recommendations[:limit]
        
        if final_recommendations:
            score_range = f"{final_recommendations[0]['total_score']:.3f}-{final_recommendations[-1]['total_score']:.3f}"
        else:
            score_range = "0-0"
            
        logger.info(f"🎯 User {user_id}: {len(final_recommendations)} recommendations, scores: {score_range}")
        
        return final_recommendations
    
    def _calculate_product_score(self, product: Dict, user_profile: Dict) -> Dict:
        """Вычисление скора для товара с компонентами"""
        
        components = {}
        
        # 1. Категориальное сходство (40% веса)
        product_main_category = product['main_category']
        user_categories = user_profile['category_stats']
        
        if user_categories and product_main_category in user_categories:
            total_purchases = sum(user_categories.values())
            category_share = user_categories[product_main_category] / total_purchases
            components['category_similarity'] = min(category_share * 2.0, 1.0) * 0.4
        else:
            components['category_similarity'] = 0.1 * 0.4  # Базовый скор для новых категорий
        
        # 2. Популярность товара (25% веса)
        purchase_count = product.get('purchase_count', 0)
        # Логарифмическая нормализация для популярности
        popularity_score = min(math.log(purchase_count + 1) / math.log(1000), 1.0)
        components['popularity'] = popularity_score * 0.25
        
        # 3. Совместимость по цене (25% веса)
        price_stats = user_profile.get('price_stats', {})
        if price_stats and 'avg_price' in price_stats:
            user_avg_price = price_stats['avg_price']
            product_price = product['average_price']
            
            if user_avg_price > 0:
                # Мягкое сравнение цен - учитываем диапазон ±50%
                price_diff = abs(product_price - user_avg_price) / user_avg_price
                if price_diff <= 0.5:  # В пределах 50% от средней цены пользователя
                    price_score = 1.0 - (price_diff / 0.5)  # Линейное уменьшение
                else:
                    price_score = 0.1
                components['price_compatibility'] = price_score * 0.25
            else:
                components['price_compatibility'] = 0.5 * 0.25
        else:
            components['price_compatibility'] = 0.3 * 0.25  # Базовый скор
        
        # 4. Качество данных товара (10% веса)
        data_quality = 0.0
        if product['name'] and len(product['name'].strip()) > 10:
            data_quality += 0.05
        if product['manufacturer']:
            data_quality += 0.03
        if product['description']:
            data_quality += 0.02
        components['data_quality'] = data_quality * 0.10
        
        # Общий score
        total_score = sum(components.values())
        
        return {
            'total_score': min(total_score, 1.0),
            'components': {k: round(v, 4) for k, v in components.items()}
        }
    
    def _generate_explanation(self, product: Dict, user_profile: Dict, score_data: Dict) -> str:
        """Генерация объяснения рекомендации"""
        
        explanations = []
        components = score_data['components']
        
        # На основе категории
        if components['category_similarity'] > 0.3:
            explanations.append("соответствует вашим интересам")
        elif components['category_similarity'] > 0.1:
            explanations.append("в вашей сфере деятельности")
        
        # На основе цены
        if components['price_compatibility'] > 0.2:
            explanations.append("подходит по бюджету")
        
        # На основе популярности
        if components['popularity'] > 0.15:
            purchase_count = product.get('purchase_count', 0)
            if purchase_count > 100:
                explanations.append("популярный выбор")
            elif purchase_count > 10:
                explanations.append("востребованный товар")
        
        if explanations:
            return "Рекомендуем: " + ", ".join(explanations)
        else:
            return "Качественный товар из нашего каталога"

# Global services
db_service = DatabaseService()
recommendation_engine = RecommendationEngine(db_service)

# Startup
@app.on_event("startup")
async def startup_event():
    await db_service.connect()
    logger.info("✅ Recommendation services initialized")

# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Procurement Recommendations API", 
        "status": "running",
        "version": "2.0-real-data"
    }

@app.get("/health")
async def health_check():
    try:
        # Проверяем БД и получаем статистику
        async with db_service.pool.acquire() as conn:
            available_products = await conn.fetchval(
                "SELECT COUNT(*) FROM products WHERE is_available = true AND average_price > 0"
            )
            total_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        
        return {
            "status": "healthy", 
            "database": "connected",
            "available_products": available_products,
            "total_users": total_users,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected", 
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """Основной endpoint для рекомендаций"""
    try:
        recommendations = await recommendation_engine.generate_recommendations(
            user_id=request.user_id,
            limit=request.limit
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="postgresql_real_data",
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommendations/{user_id}")
async def get_recommendations_get(user_id: str, limit: int = 15):
    """GET версия для рекомендаций"""
    return await get_recommendations(RecommendationRequest(user_id=user_id, limit=limit))

# Совместимость с существующими endpoint'ами
@app.get("/api/ml/health")
async def ml_health():
    return await health_check()

@app.post("/api/ml/recommendations")
async def ml_recommendations(request: RecommendationRequest):
    return await get_recommendations(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")