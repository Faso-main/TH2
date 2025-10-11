# main.py - FastAPI Production Version for Ubuntu VPS
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncpg
import os
from datetime import datetime
import logging
from collections import defaultdict, Counter

# Production logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/procurement_api.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Procurement Recommendations API",
    description="Production API for procurement recommendations",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000", 
        "https://faso312.ru",
        "http://faso312.ru"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Модели данных
class RecommendationRequest(BaseModel):
    user_id: str
    limit: int = 15
    include_history: bool = False

class RecommendationResponse(BaseModel):
    user_id: str
    recommendations_count: int
    recommendations: List[Dict]
    engine: str
    generated_at: str

class HealthResponse(BaseModel):
    status: str
    database: str
    smart_engine: bool
    products_loaded: int
    timestamp: str
    version: str

# Database Connector с retry логикой
class DatabaseConnector:
    def __init__(self):
        self.pool = None
        self.max_retries = 3
        self.retry_delay = 2
        
    async def connect(self):
        """Подключение к PostgreSQL с retry логикой"""
        for attempt in range(self.max_retries):
            try:
                # Получаем параметры из переменных окружения или используем дефолты
                db_host = os.getenv('DB_HOST', 'localhost')
                db_port = int(os.getenv('DB_PORT', '5432'))
                db_name = os.getenv('DB_NAME', 'pc_db')
                db_user = os.getenv('DB_USER', 'store_app1')
                db_password = os.getenv('DB_PASSWORD', '1234')
                
                self.pool = await asyncpg.create_pool(
                    user=db_user,
                    host=db_host,
                    database=db_name,
                    password=db_password,
                    port=db_port,
                    min_size=5,
                    max_size=20,
                    command_timeout=60
                )
                
                # Test connection
                async with self.pool.acquire() as conn:
                    await conn.execute('SELECT 1')
                
                logger.info("✅ Successfully connected to PostgreSQL database")
                return
                
            except Exception as e:
                logger.error(f"❌ Database connection attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    logger.info(f"Retrying in {self.retry_delay} seconds...")
                    import asyncio
                    await asyncio.sleep(self.retry_delay)
                else:
                    raise
    
    async def get_user_procurements(self, user_id: str) -> List[Dict]:
        """Получить историю закупок пользователя"""
        try:
            query = """
            SELECT 
                p.procurement_id,
                pi.product_id,
                pi.quantity,
                pi.unit_price,
                pr.name as product_name,
                pr.category_id,
                c.name as category_name,
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
                    'category_name': row['category_name'],
                    'quantity': row['quantity'],
                    'unit_price': float(row['unit_price']) if row['unit_price'] else 0,
                    'average_price': float(row['average_price']) if row['average_price'] else 0,
                    'procurement_date': row['procurement_date'].isoformat() if row['procurement_date'] else None
                })
            
            logger.info(f"📊 Loaded {len(procurements)} procurement items for user {user_id}")
            return procurements
            
        except Exception as e:
            logger.error(f"Error getting user procurements: {e}")
            return []
    
    async def get_available_products(self, limit: int = 10000) -> List[Dict]:
        """Получить доступные товары с реальными ценами"""
        try:
            query = """
            SELECT 
                product_id, 
                name, 
                description, 
                category_id,
                manufacturer, 
                average_price, 
                unit_of_measure,
                specifications,
                is_available
            FROM products 
            WHERE is_available = true
            AND average_price > 0
            AND name IS NOT NULL
            ORDER BY average_price DESC
            LIMIT $1
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
            
            products = []
            for row in rows:
                products.append({
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'description': row['description'],
                    'category_id': row['category_id'],
                    'manufacturer': row['manufacturer'],
                    'average_price': float(row['average_price']) if row['average_price'] else 0,
                    'unit_of_measure': row['unit_of_measure'],
                    'specifications': row['specifications'],
                    'is_available': row['is_available']
                })
            
            logger.info(f"📦 Loaded {len(products)} available products from database")
            return products
            
        except Exception as e:
            logger.error(f"Error getting available products: {e}")
            return []
    
    async def get_category_name(self, category_id: str) -> str:
        """Получить название категории по ID"""
        if not category_id:
            return "Другое"
            
        try:
            query = "SELECT name FROM categories WHERE category_id = $1"
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(query, category_id)
            return row['name'] if row else "Другое"
        except Exception as e:
            logger.warning(f"Could not get category name for {category_id}: {e}")
            return "Другое"
    
    async def get_popular_products(self, limit: int = 200) -> List[Dict]:
        """Получить популярные товары (часто закупаемые)"""
        try:
            query = """
            SELECT 
                p.product_id,
                p.name,
                p.average_price,
                p.category_id,
                COUNT(pi.procurement_item_id) as purchase_count
            FROM products p
            JOIN procurement_items pi ON p.product_id = pi.product_id
            WHERE p.is_available = true
            GROUP BY p.product_id, p.name, p.average_price, p.category_id
            ORDER BY purchase_count DESC
            LIMIT $1
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
            
            popular_products = []
            for row in rows:
                popular_products.append({
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'average_price': float(row['average_price']),
                    'category_id': row['category_id'],
                    'purchase_count': row['purchase_count']
                })
            
            return popular_products
            
        except Exception as e:
            logger.error(f"Error getting popular products: {e}")
            return []

# Smart Recommendation Engine
class SmartRecommendationEngine:
    def __init__(self, db_connector):
        self.db = db_connector
        self.config = {
            'weights': {
                'purchase_history': 0.35,
                'category_similarity': 0.25, 
                'price_compatibility': 0.20,
                'popularity': 0.15,
                'availability': 0.05
            },
            'price_tolerance': 0.3
        }
        
        self.popular_products = []
        self.products_cache = []
        self.cache_timestamp = None
        self.cache_ttl = 300  # 5 минут
    
    async def initialize(self):
        """Инициализация - загрузка популярных товаров"""
        self.popular_products = await self.db.get_popular_products(200)
        logger.info(f"📈 Loaded {len(self.popular_products)} popular products")
    
    async def _get_cached_products(self):
        """Получить товары с кэшированием"""
        now = datetime.now().timestamp()
        
        if (not self.products_cache or 
            not self.cache_timestamp or 
            (now - self.cache_timestamp) > self.cache_ttl):
            
            self.products_cache = await self.db.get_available_products(8000)
            self.cache_timestamp = now
            logger.info(f"🔄 Refreshed products cache: {len(self.products_cache)} items")
        
        return self.products_cache
    
    def _analyze_user_behavior(self, user_procurements: List[Dict]) -> Dict:
        """Анализ поведения пользователя"""
        profile = {
            'purchased_products': set(),
            'preferred_categories': Counter(),
            'price_ranges': defaultdict(list),
            'total_spent': 0,
            'avg_price_per_item': 0,
            'category_weights': defaultdict(float)
        }
        
        if not user_procurements:
            return profile
        
        for procurement in user_procurements:
            product_id = procurement['product_id']
            category = procurement['category_name']
            price = procurement['unit_price'] or procurement['average_price']
            
            profile['purchased_products'].add(product_id)
            profile['preferred_categories'][category] += 1
            profile['price_ranges'][category].append(price)
            profile['total_spent'] += price * procurement.get('quantity', 1)
        
        total_items = sum(profile['preferred_categories'].values())
        if total_items > 0:
            profile['avg_price_per_item'] = profile['total_spent'] / total_items
        
        total_categories = sum(profile['preferred_categories'].values())
        if total_categories > 0:
            for category, count in profile['preferred_categories'].items():
                profile['category_weights'][category] = count / total_categories
        
        logger.info(f"👤 User profile: {total_items} items, {len(profile['preferred_categories'])} categories, avg price: {profile['avg_price_per_item']:.0f}")
        return profile
    
    def _calculate_purchase_history_score(self, product: Dict, user_profile: Dict) -> float:
        if not user_profile['purchased_products']:
            return 0.5
        
        product_category = product.get('category_name', 'Другое')
        category_weight = user_profile['category_weights'].get(product_category, 0)
        return min(category_weight * 2.0, 1.0)
    
    def _calculate_category_similarity(self, product: Dict, user_profile: Dict) -> float:
        product_category = product.get('category_name', 'Другое')
        
        if not user_profile['preferred_categories']:
            return 0.3
        
        max_count = max(user_profile['preferred_categories'].values())
        category_count = user_profile['preferred_categories'].get(product_category, 0)
        return category_count / max_count if max_count > 0 else 0
    
    def _calculate_price_compatibility(self, product: Dict, user_profile: Dict) -> float:
        product_price = product.get('average_price', 0)
        user_avg_price = user_profile['avg_price_per_item']
        
        if user_avg_price == 0:
            return 0.5
        
        price_ratio = min(product_price, user_avg_price) / max(product_price, user_avg_price)
        tolerance = self.config['price_tolerance']
        
        if abs(product_price - user_avg_price) <= user_avg_price * tolerance:
            return min(price_ratio + 0.3, 1.0)
        
        return price_ratio
    
    def _calculate_popularity_score(self, product: Dict) -> float:
        product_id = product['product_id']
        
        for popular_product in self.popular_products:
            if popular_product['product_id'] == product_id:
                max_purchases = max(p['purchase_count'] for p in self.popular_products) if self.popular_products else 1
                return popular_product['purchase_count'] / max_purchases
        
        return 0.1
    
    def _generate_explanation(self, product: Dict, user_profile: Dict, scores: Dict) -> str:
        explanations = []
        
        if scores['purchase_history'] > 0.7:
            explanations.append("часто покупаете в этой категории")
        elif scores['purchase_history'] > 0.4:
            explanations.append("похоже на ваши предыдущие покупки")
        
        if scores['category_similarity'] > 0.6:
            category = product.get('category_name', 'этой категории')
            explanations.append(f"популярно в {category}")
        
        if scores['price_compatibility'] > 0.8:
            explanations.append("отлично подходит по цене")
        elif scores['price_compatibility'] > 0.6:
            explanations.append("подходит по вашему бюджету")
        
        if scores['popularity'] > 0.7:
            explanations.append("популярный выбор")
        
        return "Рекомендуем: " + ", ".join(explanations) if explanations else "Персональная рекомендация на основе анализа закупок"
    
    async def get_personalized_recommendations(self, user_id: str, limit: int = 15) -> List[Dict]:
        """Умные персонализированные рекомендации"""
        try:
            # 1. Получаем историю пользователя
            user_procurements = await self.db.get_user_procurements(user_id)
            
            # 2. Получаем доступные товары (с кэшем)
            available_products = await self._get_cached_products()
            
            # 3. Анализируем поведение пользователя
            user_profile = self._analyze_user_behavior(user_procurements)
            
            # 4. Получаем названия категорий для товаров
            for product in available_products:
                product['category_name'] = await self.db.get_category_name(product['category_id'])
            
            # 5. Генерируем рекомендации
            recommendations = []
            purchased_ids = user_profile['purchased_products']
            
            for product in available_products:
                if product['product_id'] in purchased_ids:
                    continue
                
                scores = {
                    'purchase_history': self._calculate_purchase_history_score(product, user_profile),
                    'category_similarity': self._calculate_category_similarity(product, user_profile),
                    'price_compatibility': self._calculate_price_compatibility(product, user_profile),
                    'popularity': self._calculate_popularity_score(product),
                    'availability': 1.0
                }
                
                total_score = sum(
                    scores[factor] * self.config['weights'][factor] 
                    for factor in scores
                )
                
                if total_score > 0.2:
                    recommendations.append({
                        'product_id': product['product_id'],
                        'product_name': product['name'],
                        'product_category': product['category_name'],
                        'total_score': round(total_score, 4),
                        'component_scores': {k: round(v, 4) for k, v in scores.items()},
                        'explanation': self._generate_explanation(product, user_profile, scores),
                        'price_range': {
                            'avg': product['average_price'],
                            'min': product['average_price'] * 0.7,
                            'max': product['average_price'] * 1.3,
                            'source': 'database_real'
                        },
                        'in_catalog': True,
                        'is_available': True,
                        'real_data': True
                    })
            
            # 6. Сортируем и ограничиваем
            recommendations.sort(key=lambda x: x['total_score'], reverse=True)
            final_recommendations = recommendations[:limit]
            
            logger.info(f"🎯 Generated {len(final_recommendations)} recommendations for user {user_id}")
            if final_recommendations:
                logger.info(f"📊 Score range: {final_recommendations[0]['total_score']:.3f} - {final_recommendations[-1]['total_score']:.3f}")
            
            return final_recommendations
            
        except Exception as e:
            logger.error(f"Error generating recommendations for {user_id}: {e}")
            return []

# Глобальные объекты
db_connector = DatabaseConnector()
smart_engine = SmartRecommendationEngine(db_connector)

# Startup event
@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске"""
    try:
        await db_connector.connect()
        await smart_engine.initialize()
        logger.info("✅ Smart recommendation engine initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        # Не падаем полностью, сервис будет пытаться переподключиться

# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Smart Procurement Recommendations API", 
        "status": "running",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Проверка здоровья сервиса"""
    try:
        test_products = await db_connector.get_available_products(5)
        return HealthResponse(
            status="healthy",
            database="pc_db",
            smart_engine=True,
            products_loaded=len(test_products),
            timestamp=datetime.now().isoformat(),
            version="2.0.0"
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            database="pc_db", 
            smart_engine=False,
            products_loaded=0,
            timestamp=datetime.now().isoformat(),
            version="2.0.0"
        )

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """Получить умные рекомендации для пользователя"""
    try:
        recommendations = await smart_engine.get_personalized_recommendations(
            user_id=request.user_id,
            limit=request.limit
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="smart_v1",
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommendations/{user_id}")
async def get_recommendations_by_user_id(user_id: str, limit: int = 15):
    """Получить рекомендации по ID пользователя (GET версия)"""
    try:
        recommendations = await smart_engine.get_personalized_recommendations(
            user_id=user_id,
            limit=limit
        )
        
        return RecommendationResponse(
            user_id=user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="smart_v1", 
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Совместимость со старыми endpoint'ами
@app.post("/api/recommendations/user/{user_id}")
async def legacy_get_recommendations(user_id: str, limit: int = 15):
    return await get_recommendations_by_user_id(user_id, limit)

@app.get("/api/ml/health")
async def ml_health():
    return await health_check()

@app.post("/api/ml/recommendations") 
async def ml_recommendations(request: RecommendationRequest):
    return await get_recommendations(request)

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception handler: {exc}")
    return JSONResponse( # pyright: ignore[reportUndefinedVariable]
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",  # Слушаем все интерфейсы
        port=8000,
        workers=2,  # 2 воркера для production
        log_level="info"
    )