# main2.py - Исправленная версия с правильной валидацией
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncpg
import os
from datetime import datetime
import logging
import asyncio
import uvicorn

# =============================================
# НАСТРОЙКА ЛОГИРОВАНИЯ И КОНФИГУРАЦИЯ
# =============================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Конфигурация
class Config:
    HOST = "127.0.0.1"
    PORT = 8000
    DB_USER = "faso_user"
    DB_PASSWORD = "1234"
    DB_HOST = "localhost"
    DB_PORT = 5432
    DB_NAME = "pc_db"
    MAX_RECOMMENDATIONS = 50
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://faso312.ru",
        "https://www.faso312.ru"
    ]

config = Config()

# =============================================
# МОДЕЛИ ДАННЫХ
# =============================================

class RecommendationRequest(BaseModel):
    user_id: str
    limit: int = 10
    strategy: str = "balanced"  # balanced, budget, premium

class BundleRequest(BaseModel):
    user_id: str
    target_budget: float = 50000
    max_items: int = 10
    strategy: str = "balanced"

class ProductRecommendation(BaseModel):
    product_id: str
    product_name: str
    product_category: str
    total_score: float
    explanation: str
    confidence: float
    price_range: Dict[str, float]  # ТОЛЬКО числовые поля!
    in_catalog: bool = True
    is_available: bool = True
    purchase_count: int = 0

class RecommendationResponse(BaseModel):
    user_id: str
    recommendations_count: int
    recommendations: List[ProductRecommendation]
    engine: str
    generated_at: str

class BundleResponse(BaseModel):
    user_id: str
    bundle_size: int
    total_cost: float
    budget_used_percent: float
    budget_remaining: float
    categories_covered: List[str]
    avg_confidence: float
    strategy_used: str
    products: List[ProductRecommendation]

# =============================================
# СЕРВИС БАЗЫ ДАННЫХ
# =============================================

class DatabaseService:
    def __init__(self):
        self.pool = None
        self.connected = False
    
    async def connect(self):
        """Подключение к базе данных с повторными попытками"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"Попытка подключения к БД ({attempt + 1}/{max_retries})...")
                
                self.pool = await asyncpg.create_pool(
                    user=config.DB_USER,
                    host=config.DB_HOST,
                    database=config.DB_NAME,
                    password=config.DB_PASSWORD,
                    port=config.DB_PORT,
                    min_size=1,
                    max_size=5,
                    command_timeout=30
                )
                
                # Проверяем подключение
                async with self.pool.acquire() as conn:
                    await conn.execute("SELECT 1")
                
                self.connected = True
                logger.info("✅ Успешное подключение к PostgreSQL")
                return
                
            except Exception as e:
                logger.error(f"❌ Ошибка подключения к БД (попытка {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
                else:
                    logger.error("❌ Не удалось подключиться к БД после всех попыток")
                    self.connected = False
    
    async def disconnect(self):
        """Закрытие подключения к БД"""
        if self.pool:
            await self.pool.close()
            logger.info("✅ Подключение к БД закрыто")
    
    async def health_check(self):
        """Проверка здоровья БД"""
        if not self.connected or not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval("SELECT 1")
                return result == 1
        except Exception as e:
            logger.error(f"Ошибка проверки здоровья БД: {e}")
            self.connected = False
            return False
    
    async def get_user_history(self, user_id: str) -> List[Dict]:
        """Получение истории покупок пользователя"""
        if not self.connected:
            return []
        
        try:
            query = """
            SELECT 
                p.product_id,
                p.name as product_name,
                c.name as category_name,
                pi.quantity,
                pi.unit_price
            FROM procurements pr
            JOIN procurement_items pi ON pr.procurement_id = pi.procurement_id
            JOIN products p ON pi.product_id = p.product_id
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE pr.user_id = $1 AND p.is_available = true
            ORDER BY pr.procurement_date DESC
            LIMIT 100
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, user_id)
            
            history = []
            for row in rows:
                history.append({
                    'product_id': row['product_id'],
                    'product_name': row['product_name'],
                    'category_name': row['category_name'] or 'Без категории',
                    'quantity': row['quantity'] or 1,
                    'unit_price': float(row['unit_price']) if row['unit_price'] else 0
                })
            
            logger.info(f"Загружено {len(history)} записей истории для пользователя {user_id}")
            return history
            
        except Exception as e:
            logger.error(f"Ошибка получения истории пользователя: {e}")
            return []
    
    async def get_available_products(self, limit: int = 50) -> List[Dict]:
        """Получение доступных товаров"""
        if not self.connected:
            return []
        
        try:
            query = """
            SELECT 
                p.product_id,
                p.name,
                p.description,
                p.manufacturer,
                p.average_price,
                p.unit_of_measure,
                c.name as category_name,
                (SELECT COUNT(*) FROM procurement_items pi WHERE pi.product_id = p.product_id) as purchase_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.is_available = true 
                AND p.average_price > 0
                AND p.name IS NOT NULL
            ORDER BY purchase_count DESC, p.average_price DESC
            LIMIT $1
            """
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
            
            products = []
            seen_names = set()
            
            for row in rows:
                # Убираем дубликаты по нормализованному имени
                normalized_name = self._normalize_product_name(row['name'])
                if normalized_name in seen_names:
                    continue
                seen_names.add(normalized_name)
                
                products.append({
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'description': row['description'],
                    'manufacturer': row['manufacturer'],
                    'average_price': float(row['average_price']),
                    'category_name': row['category_name'] or 'Офисные товары',
                    'purchase_count': row['purchase_count'] or 0,
                    'unit_of_measure': row['unit_of_measure']
                })
            
            logger.info(f"Загружено {len(products)} уникальных товаров")
            return products
            
        except Exception as e:
            logger.error(f"Ошибка получения товаров: {e}")
            return []
    
    def _normalize_product_name(self, name: str) -> str:
        """Нормализация названия товара"""
        if not name:
            return ""
        return name.lower().strip()

# =============================================
# СЕРВИС РЕКОМЕНДАЦИЙ
# =============================================

class RecommendationService:
    def __init__(self, db_service: DatabaseService):
        self.db = db_service
        self.initialized = False
    
    async def initialize(self):
        """Инициализация сервиса рекомендаций"""
        try:
            # Проверяем подключение к БД
            if not await self.db.health_check():
                logger.warning("БД не подключена, рекомендации будут ограничены")
            
            self.initialized = True
            logger.info("✅ Сервис рекомендаций инициализирован")
            
        except Exception as e:
            logger.error(f"❌ Ошибка инициализации сервиса рекомендаций: {e}")
            self.initialized = False
    
    async def generate_recommendations(
        self, 
        user_id: str, 
        limit: int = 10, 
        strategy: str = "balanced"
    ) -> List[Dict]:
        """Генерация рекомендаций"""
        try:
            logger.info(f"Генерация рекомендаций для пользователя {user_id}")
            
            # Получаем историю пользователя
            user_history = await self.db.get_user_history(user_id)
            
            # Получаем доступные товары
            available_products = await self.db.get_available_products(config.MAX_RECOMMENDATIONS)
            
            if not available_products:
                logger.warning("Нет доступных товаров для рекомендаций")
                return []
            
            # Генерируем рекомендации
            recommendations = []
            
            for product in available_products:
                score_data = self._calculate_product_score(product, user_history, strategy)
                
                if score_data['total_score'] > 0.1:  # Минимальный порог
                    recommendations.append({
                        'product_id': product['product_id'],
                        'product_name': product['name'],
                        'product_category': product['category_name'],
                        'total_score': round(score_data['total_score'], 4),
                        'explanation': score_data['explanation'],
                        'confidence': score_data['confidence'],
                        'price_range': {  # ИСПРАВЛЕНО: только числовые поля
                            'avg': product['average_price'],
                            'min': product['average_price'] * 0.8,
                            'max': product['average_price'] * 1.2
                        },
                        'in_catalog': True,
                        'is_available': True,
                        'purchase_count': product['purchase_count']
                    })
            
            # Сортируем по стратегии
            if strategy == "budget":
                recommendations.sort(key=lambda x: x['price_range']['avg'])
            elif strategy == "premium":
                recommendations.sort(key=lambda x: x['price_range']['avg'], reverse=True)
            else:  # balanced
                recommendations.sort(key=lambda x: x['total_score'], reverse=True)
            
            result = recommendations[:limit]
            logger.info(f"Сгенерировано {len(result)} рекомендаций")
            return result
            
        except Exception as e:
            logger.error(f"Ошибка генерации рекомендаций: {e}")
            return []
    
    def _calculate_product_score(self, product: Dict, user_history: List[Dict], strategy: str) -> Dict:
        """Расчет скора для товара"""
        score = 0.0
        explanations = []
        
        # Базовый скор за популярность
        popularity = min(product.get('purchase_count', 0) / 100.0, 0.3)
        score += popularity
        if popularity > 0.1:
            explanations.append("популярный товар")
        
        # Скор за категорию из истории
        user_categories = {item['category_name'] for item in user_history}
        if product['category_name'] in user_categories:
            score += 0.4
            explanations.append("в ваших предпочтениях")
        
        # Скор за ценовую стратегию
        price = product['average_price']
        if strategy == "budget" and price < 5000:
            score += 0.2
            explanations.append("бюджетный вариант")
        elif strategy == "premium" and price > 10000:
            score += 0.2
            explanations.append("премиальное качество")
        elif strategy == "balanced" and 3000 <= price <= 15000:
            score += 0.1
        
        # Уверенность на основе данных
        confidence = min(0.9, score + 0.3)
        
        return {
            'total_score': min(score, 1.0),
            'explanation': ", ".join(explanations) if explanations else "рекомендовано для вас",
            'confidence': confidence
        }
    
    async def generate_bundle(
        self, 
        user_id: str, 
        target_budget: float = 50000, 
        max_items: int = 10, 
        strategy: str = "balanced"
    ) -> Dict:
        """Генерация бандла закупки"""
        try:
            recommendations = await self.generate_recommendations(
                user_id, max_items * 2, strategy
            )
            
            selected_products = []
            current_cost = 0
            categories_covered = set()
            
            for rec in recommendations:
                if len(selected_products) >= max_items:
                    break
                
                product_cost = rec['price_range']['avg']
                if current_cost + product_cost <= target_budget:
                    selected_products.append(rec)
                    current_cost += product_cost
                    categories_covered.add(rec['product_category'])
            
            budget_used = (current_cost / target_budget * 100) if target_budget > 0 else 0
            avg_confidence = self._calculate_avg_confidence(selected_products)
            
            return {
                'bundle_size': len(selected_products),
                'total_cost': round(current_cost, 2),
                'budget_used_percent': round(budget_used, 1),
                'budget_remaining': round(target_budget - current_cost, 2),
                'categories_covered': list(categories_covered),
                'avg_confidence': avg_confidence,
                'strategy_used': strategy,
                'products': selected_products
            }
            
        except Exception as e:
            logger.error(f"Ошибка генерации бандла: {e}")
            return self._get_empty_bundle(target_budget, strategy)
    
    def _calculate_avg_confidence(self, products: List[Dict]) -> float:
        """Расчет средней уверенности"""
        if not products:
            return 0.0
        return round(sum(p.get('confidence', 0) for p in products) / len(products), 2)
    
    def _get_empty_bundle(self, target_budget: float, strategy: str) -> Dict:
        """Пустой бандл при ошибке"""
        return {
            'bundle_size': 0,
            'total_cost': 0,
            'budget_used_percent': 0,
            'budget_remaining': target_budget,
            'categories_covered': [],
            'avg_confidence': 0,
            'strategy_used': strategy,
            'products': []
        }

# =============================================
# ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
# =============================================

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Запуск Procurement ML API...")
    try:
        await db_service.connect()
        await recommendation_service.initialize()
        logger.info("✅ Все сервисы инициализированы")
    except Exception as e:
        logger.error(f"❌ Ошибка запуска: {e}")
    yield
    # Shutdown
    await db_service.disconnect()
    logger.info("🔴 Приложение остановлено")

app = FastAPI(
    title="Procurement ML API",
    description="API для рекомендаций в системе закупок", 
    version="2.0.1",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальные сервисы
db_service = DatabaseService()
recommendation_service = RecommendationService(db_service)

# =============================================
# API ЭНДПОИНТЫ
# =============================================

@app.get("/")
async def root():
    return {
        "message": "Procurement ML API", 
        "status": "running", 
        "version": "2.0.1"
    }

@app.get("/health")
async def health():
    """Проверка здоровья сервиса"""
    try:
        db_healthy = await db_service.health_check()
        ml_ready = recommendation_service.initialized
        
        status = "healthy" if db_healthy else "degraded"
        
        return {
            "status": status,
            "database": "connected" if db_healthy else "disconnected",
            "ml_service": "ready" if ml_ready else "initializing",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Ошибка health check: {e}")
        return {"status": "unhealthy", "error": str(e)}

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """Получение рекомендаций"""
    try:
        recommendations = await recommendation_service.generate_recommendations(
            user_id=request.user_id,
            limit=request.limit,
            strategy=request.strategy
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="stable_v2",
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Ошибка получения рекомендаций: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bundle", response_model=BundleResponse)
async def generate_bundle(request: BundleRequest):
    """Генерация бандла закупки"""
    try:
        bundle = await recommendation_service.generate_bundle(
            user_id=request.user_id,
            target_budget=request.target_budget,
            max_items=request.max_items,
            strategy=request.strategy
        )
        
        return BundleResponse(**bundle)
        
    except Exception as e:
        logger.error(f"Ошибка генерации бандла: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Эндпоинты для совместимости с Express прокси
@app.get("/api/ml/health")
async def ml_health():
    return await health()

@app.post("/api/ml/recommendations")
async def ml_recommendations(request: RecommendationRequest):
    return await get_recommendations(request)

# =============================================
# ЗАПУСК СЕРВЕРА
# =============================================

if __name__ == "__main__":
    logger.info(f"🚀 Запуск сервера на {config.HOST}:{config.PORT}")
    uvicorn.run(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level="info",
        access_log=True
    )