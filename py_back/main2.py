# main.py - Улучшенная версия с устранением дубликатов и интеграцией лучших практик
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
import re
import json
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Enhanced Procurement Recommendations API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://faso312.ru"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RecommendationRequest(BaseModel):
    user_id: str
    limit: int = 15
    strategy: str = "balanced"  # balanced, budget, premium

class BundleRequest(BaseModel):
    user_id: str
    target_budget: float = 50000
    max_items: int = 10
    strategy: str = "balanced"

class RecommendationResponse(BaseModel):
    user_id: str
    recommendations_count: int
    recommendations: List[Dict]
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
    products: List[Dict]

class EnhancedRecommendationConfig:
    TFIDF_MIN_DF = 1
    TFIDF_MAX_DF = 0.9
    TFIDF_NGRAM_RANGE = (1, 2)
    TFIDF_MAX_FEATURES = 2000
    
    WEIGHTS = {
        'content_similarity': 0.40,
        'collaborative_filtering': 0.25,
        'availability': 0.20,
        'price_affordability': 0.15
    }
    
    PRICE_ESTIMATES = {
        'Канцелярия': {'min': 500, 'max': 3000, 'avg': 1000},
        'Хозтовары': {'min': 1000, 'max': 5000, 'avg': 2000},
        'Офисная техника': {'min': 5000, 'max': 15000, 'avg': 8000},
        'IT оборудование': {'min': 10000, 'max': 30000, 'avg': 15000},
        'Мебель': {'min': 15000, 'max': 50000, 'avg': 25000},
        'Строительные материалы': {'min': 8000, 'max': 20000, 'avg': 12000},
        'Электроника': {'min': 3000, 'max': 20000, 'avg': 8000},
        'Расходные материалы': {'min': 800, 'max': 4000, 'avg': 2000},
        'Бумажная продукция': {'min': 500, 'max': 3000, 'avg': 1200},
        'Офисные товары': {'min': 1000, 'max': 8000, 'avg': 3000},
        'default': {'min': 2000, 'max': 10000, 'avg': 5000}
    }
    
    DIVERSITY = {
        'max_per_category': 3,
        'min_categories': 3,
        'category_penalty': 0.1
    }

class DatabaseService:
    def __init__(self):
        self.pool = None
        
    async def connect(self):
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
            logger.info("Connected to PostgreSQL database")
            
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    async def get_user_procurements(self, user_id: str) -> List[Dict]:
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
            seen_names = set()
            
            for row in rows:
                normalized_name = self._normalize_product_name(row['name'])
                
                if normalized_name in seen_names:
                    continue
                seen_names.add(normalized_name)
                
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
                    'purchase_count': row['purchase_count'] or 0,
                    'features': self._extract_product_features(row)
                })
            
            category_dist = Counter(p['category_name'] for p in products)
            logger.info(f"Loaded {len(products)} unique available products")
            logger.info(f"Category distribution: {dict(category_dist.most_common(8))}")
            
            return products
            
        except Exception as e:
            logger.error(f"Error getting available products: {e}")
            return []
    
    def _normalize_product_name(self, name: str) -> str:
        if not name:
            return ""
        
        normalized = name.lower().strip()
        normalized = re.sub(r'\s+', ' ', normalized)
        normalized = re.sub(r'\s*\(\s*\d+\s*шт/\s*уп\s*\)', '', normalized)
        normalized = re.sub(r'\s*\d+\s*шт/\s*уп\.?', '', normalized)
        normalized = re.sub(r'\s*\(\s*[^)]*\d+\s*мм\s*[^)]*\)', '', normalized)
        
        return normalized.strip()
    
    def _improve_category(self, current_category: str, product_name: str) -> str:
        if current_category and current_category != 'Без категории':
            return current_category
        
        name_lower = product_name.lower()
        
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'ластик', 'линейка', 'блокнот', 'тетрадь', 'скрепка', 'степлер', 'дырокол'],
            'Бумажная продукция': ['бумага', 'пленка', 'ламинирован', 'картридж', 'тонер', 'блок для записей'],
            'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'ламинатор', 'брошюратор'],
            'Расходные материалы': ['картридж', 'тонер', 'пленка', 'чернила', 'бумага'],
            'Электроника': ['usb', 'кабель', 'разветвитель', 'роутер', 'наушник', 'колонка'],
            'Хозтовары': ['мыло', 'туалетная', 'бумага', 'моющее', 'чистящ', 'перчатк'],
            'Мебель': ['стол', 'стул', 'кресло', 'шкаф', 'полка', 'стеллаж'],
            'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'монитор', 'клавиатура', 'мышь'],
            'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительный', 'кисть', 'валик']
        }
        
        for category, keywords in category_keywords.items():
            if any(keyword in name_lower for keyword in keywords):
                return category
        
        return 'Офисные товары'
    
    def _extract_product_features(self, row) -> Dict:
        features = {}
        
        if row['description']:
            features['description'] = str(row['description'])[:100]
        if row['manufacturer']:
            features['manufacturer'] = str(row['manufacturer'])
        if row['specifications']:
            features['specifications'] = str(row['specifications'])[:100]
        if row['unit_of_measure']:
            features['unit'] = str(row['unit_of_measure'])
            
        return features

class EnhancedRecommendationEngine:
    def __init__(self, db_service):
        self.db = db_service
        self.config = EnhancedRecommendationConfig()
        self.user_profiles = {}
        self.similarity_matrix = None
        self.product_to_index = {}
        self.product_features = {}
        
    async def initialize_engine(self):
        products = await self.db.get_available_products(10000)
        self._build_similarity_matrix(products)
        logger.info("Enhanced recommendation engine initialized")
    
    def _build_similarity_matrix(self, products: List[Dict]):
        if not products:
            logger.warning("No products for similarity matrix")
            return
            
        product_features = {}
        
        for product in products:
            features = []
            
            features.append(f"name_{product['name'][:30].replace(' ', '_')}")
            features.append(f"category_{product['category_name'].replace(' ', '_')}")
            
            price_level = "budget" if product['average_price'] < 3000 else "mid" if product['average_price'] < 10000 else "premium"
            features.append(f"price_{price_level}")
            
            for feature_key, feature_value in product.get('features', {}).items():
                if len(str(feature_value)) > 3:
                    features.append(f"feature_{feature_key}_{str(feature_value)[:20].replace(' ', '_')}")
            
            product_features[product['product_id']] = features
            self.product_features[product['product_id']] = product
        
        if product_features:
            self.product_ids = list(product_features.keys())
            descriptions = [" ".join(product_features[pid]) for pid in self.product_ids]
            
            self.vectorizer = TfidfVectorizer(
                min_df=self.config.TFIDF_MIN_DF,
                max_df=self.config.TFIDF_MAX_DF,
                ngram_range=self.config.TFIDF_NGRAM_RANGE,
                max_features=self.config.TFIDF_MAX_FEATURES
            )
            
            tfidf_matrix = self.vectorizer.fit_transform(descriptions)
            tfidf_matrix_normalized = normalize(tfidf_matrix, norm='l2', axis=1)
            self.similarity_matrix = cosine_similarity(tfidf_matrix_normalized)
            self.product_to_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
            
            logger.info(f"Built similarity matrix for {len(self.product_ids)} products")
    
    def _get_product_similarity(self, product_id1, product_id2):
        if (product_id1 in self.product_to_index and 
            product_id2 in self.product_to_index):
            
            idx1 = self.product_to_index[product_id1]
            idx2 = self.product_to_index[product_id2]
            
            return self.similarity_matrix[idx1, idx2]
        
        return 0
    
    def create_user_profile(self, user_id: str, procurements: List[Dict]):
        user_profile = {
            'product_frequencies': Counter(),
            'preferred_categories': Counter(),
            'price_preferences': defaultdict(list),
            'total_spent': 0,
            'procurement_count': len(procurements),
            'unique_products': set(),
            'category_weights': defaultdict(float),
            'price_ranges': defaultdict(dict),
            'purchased_products': set(),
            'behavioral_patterns': self._analyze_behavioral_patterns(procurements)
        }
        
        for procurement in procurements:
            product_id = procurement['product_id']
            price = procurement['unit_price'] or procurement['average_price']
            quantity = procurement['quantity']
            
            user_profile['product_frequencies'][product_id] += quantity
            user_profile['unique_products'].add(product_id)
            user_profile['purchased_products'].add(product_id)
            user_profile['total_spent'] += price * quantity
            
            category = procurement['category_name']
            user_profile['preferred_categories'][category] += quantity
            
            user_profile['price_preferences'][category].append(price)
        
        total_products = sum(user_profile['preferred_categories'].values())
        if total_products > 0:
            for category, count in user_profile['preferred_categories'].items():
                user_profile['category_weights'][category] = count / total_products
        
        for category, prices in user_profile['price_preferences'].items():
            if prices:
                user_profile['price_ranges'][category] = {
                    'min': min(prices),
                    'max': max(prices),
                    'avg': np.mean(prices),
                    'preferred': np.median(prices)
                }
        
        self.user_profiles[user_id] = user_profile
        
        top_categories = user_profile['preferred_categories'].most_common(3)
        categories_str = ", ".join([f"{cat}({count})" for cat, count in top_categories])
        
        logger.info(f"User {user_id}: {user_profile['procurement_count']} procurements, "
                   f"{len(user_profile['unique_products'])} products, top categories: {categories_str}")
        
        return user_profile
    
    def _analyze_behavioral_patterns(self, procurements: List[Dict]):
        if not procurements:
            return {}
        
        patterns = {
            'avg_procurement_size': np.mean([proc.get('quantity', 1) for proc in procurements]),
            'preferred_categories': Counter(),
            'price_sensitivity': 0
        }
        
        for procurement in procurements:
            category = procurement['category_name']
            patterns['preferred_categories'][category] += procurement.get('quantity', 1)
        
        return patterns
    
    def calculate_enhanced_product_score(self, product_id: str, user_profile: Dict):
        product = self.product_features.get(product_id, {})
        
        scores = {
            'content_similarity': 0,
            'collaborative_filtering': 0,
            'availability': 0,
            'price_affordability': 0
        }
        
        weights = self.config.WEIGHTS
        
        if user_profile['purchased_products']:
            max_similarity = 0
            for purchased_id in user_profile['purchased_products']:
                similarity = self._get_product_similarity(purchased_id, product_id)
                max_similarity = max(max_similarity, similarity)
            
            scores['content_similarity'] = max_similarity
        
        category = product.get('category_name', 'Офисные товары')
        if category in user_profile['category_weights']:
            scores['collaborative_filtering'] = user_profile['category_weights'][category]
        else:
            scores['collaborative_filtering'] = 0.1
        
        scores['availability'] = 0.9 if product.get('is_available', False) else 0.3
        
        product_price = product.get('average_price', 0)
        if product_price > 0 and user_profile['total_spent'] > 0:
            user_avg_price = user_profile['total_spent'] / max(1, sum(user_profile['product_frequencies'].values()))
            if user_avg_price > 0:
                price_ratio = min(product_price, user_avg_price) / max(product_price, user_avg_price)
                scores['price_affordability'] = price_ratio
        
        total_score = sum(scores[factor] * weights[factor] for factor in scores)
        
        return {
            'total_score': total_score,
            'component_scores': scores,
            'explanation': self._generate_enhanced_explanation(scores, product, user_profile),
            'confidence': self._calculate_confidence_level(scores, product)
        }
    
    def _generate_enhanced_explanation(self, scores: Dict, product: Dict, user_profile: Dict):
        explanations = []
        
        if scores['content_similarity'] > 0.7:
            explanations.append("очень похож на ваши предыдущие покупки")
        elif scores['content_similarity'] > 0.4:
            explanations.append("похож на товары из вашей истории")
        
        if scores['collaborative_filtering'] > 0.6:
            explanations.append("соответствует вашим предпочтениям")
        
        if scores['availability'] > 0.8:
            explanations.append("доступен для заказа")
        
        if scores['price_affordability'] > 0.8:
            explanations.append("отлично подходит по бюджету")
        elif scores['price_affordability'] > 0.6:
            explanations.append("соответствует вашему ценовому диапазону")
        
        category = product.get('category_name', '')
        if category in user_profile['preferred_categories']:
            explanations.append("из вашей предпочитаемой категории")
        
        return "; ".join(explanations) if explanations else "рекомендовано на основе комплексного анализа"
    
    def _calculate_confidence_level(self, scores: Dict, product: Dict):
        confidence_factors = []
        
        if product.get('is_available', False):
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.5)
        
        purchase_count = product.get('purchase_count', 0)
        if purchase_count > 10:
            confidence_factors.append(0.8)
        elif purchase_count > 0:
            confidence_factors.append(0.6)
        else:
            confidence_factors.append(0.4)
        
        if scores['content_similarity'] > 0.6:
            confidence_factors.append(0.9)
        elif scores['content_similarity'] > 0.3:
            confidence_factors.append(0.6)
        else:
            confidence_factors.append(0.3)
        
        return np.mean(confidence_factors)
    
    async def generate_recommendations(self, user_id: str, limit: int = 15, strategy: str = "balanced"):
        user_procurements = await self.db.get_user_procurements(user_id)
        
        if user_id not in self.user_profiles:
            self.create_user_profile(user_id, user_procurements)
        
        user_profile = self.user_profiles[user_id]
        purchased_products = user_profile['purchased_products']
        
        recommendations = []
        seen_names = set()
        
        for product_id in self.product_ids:
            if product_id in purchased_products:
                continue
            
            product = self.product_features[product_id]
            product_name = product['name']
            
            if product_name in seen_names:
                continue
            seen_names.add(product_name)
            
            score_result = self.calculate_enhanced_product_score(product_id, user_profile)
            
            if score_result['total_score'] > 0.1:
                recommendations.append({
                    'product_id': product_id,
                    'product_name': product_name,
                    'product_category': product.get('category_name', 'Офисные товары'),
                    'total_score': round(score_result['total_score'], 4),
                    'component_scores': score_result['component_scores'],
                    'explanation': score_result['explanation'],
                    'confidence': score_result['confidence'],
                    'price_range': {
                        'avg': product.get('average_price', 0),
                        'min': product.get('average_price', 0) * 0.8,
                        'max': product.get('average_price', 0) * 1.2,
                        'source': 'database_real'
                    },
                    'in_catalog': True,
                    'is_available': product.get('is_available', False),
                    'purchase_count': product.get('purchase_count', 0)
                })
        
        recommendations.sort(key=lambda x: x['total_score'], reverse=True)
        
        if strategy == "budget":
            recommendations.sort(key=lambda x: x['price_range']['avg'])
        elif strategy == "premium":
            recommendations.sort(key=lambda x: x['price_range']['avg'], reverse=True)
        
        final_recommendations = self._apply_diversification(recommendations, limit)
        
        if final_recommendations:
            scores = [r['total_score'] for r in final_recommendations]
            logger.info(f"User {user_id}: {len(final_recommendations)} recommendations, score range: {max(scores):.3f}-{min(scores):.3f}")
        
        return final_recommendations
    
    def _apply_diversification(self, candidates: List[Dict], top_n: int):
        selected = []
        selected_categories = Counter()
        
        for candidate in candidates:
            if len(selected) >= top_n:
                break
                
            category = candidate['product_category']
            max_per_category = self.config.DIVERSITY['max_per_category']
            
            if selected_categories[category] < max_per_category:
                selected.append(candidate)
                selected_categories[category] += 1
        
        if len(selected) < top_n:
            remaining = [c for c in candidates if c not in selected]
            remaining.sort(key=lambda x: x['total_score'], reverse=True)
            selected.extend(remaining[:top_n - len(selected)])
        
        return selected[:top_n]
    
    async def generate_procurement_bundle(self, user_id: str, target_budget: float = 50000, 
                                        max_items: int = 10, strategy: str = "balanced"):
        recommendations = await self.generate_recommendations(user_id, max_items * 2, strategy)
        
        if not recommendations:
            return {"error": "Не удалось сгенерировать рекомендации"}
        
        if strategy == 'budget':
            recommendations.sort(key=lambda x: x['price_range']['avg'])
        elif strategy == 'premium':
            recommendations.sort(key=lambda x: x['price_range']['avg'], reverse=True)
        
        selected_products = []
        current_cost = 0
        categories_covered = set()
        
        for rec in recommendations:
            if len(selected_products) >= max_items:
                break
                
            avg_price = rec['price_range']['avg']
            
            if current_cost + avg_price <= target_budget:
                rec['estimated_price'] = avg_price
                selected_products.append(rec)
                current_cost += avg_price
                categories_covered.add(rec['product_category'])
        
        budget_utilization = current_cost / target_budget if target_budget > 0 else 0
        
        return {
            'bundle_size': len(selected_products),
            'total_cost': current_cost,
            'budget_used_percent': round(budget_utilization * 100, 1),
            'budget_remaining': target_budget - current_cost,
            'categories_covered': list(categories_covered),
            'avg_confidence': np.mean([p.get('confidence', 0) for p in selected_products]) if selected_products else 0,
            'strategy_used': strategy,
            'products': selected_products
        }

db_service = DatabaseService()
recommendation_engine = EnhancedRecommendationEngine(db_service)

@app.on_event("startup")
async def startup_event():
    await db_service.connect()
    await recommendation_engine.initialize_engine()
    logger.info("Enhanced recommendation engine initialized")

@app.get("/")
async def root():
    return {
        "message": "Enhanced Procurement Recommendations API", 
        "status": "running", 
        "version": "5.0-enhanced"
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
            "similarity_matrix": recommendation_engine.similarity_matrix is not None,
            "products_loaded": len(recommendation_engine.product_features),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    try:
        logger.info(f"Getting enhanced recommendations for user: {request.user_id}")
        
        recommendations = await recommendation_engine.generate_recommendations(
            user_id=request.user_id,
            limit=request.limit,
            strategy=request.strategy
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="enhanced_v5",
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bundle", response_model=BundleResponse)
async def generate_bundle(request: BundleRequest):
    try:
        logger.info(f"Generating procurement bundle for user: {request.user_id}")
        
        bundle = await recommendation_engine.generate_procurement_bundle(
            user_id=request.user_id,
            target_budget=request.target_budget,
            max_items=request.max_items,
            strategy=request.strategy
        )
        
        if 'error' in bundle:
            raise HTTPException(status_code=400, detail=bundle['error'])
        
        return BundleResponse(**bundle)
        
    except Exception as e:
        logger.error(f"Bundle generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/health")
async def ml_health():
    return await health_check()

@app.post("/api/ml/recommendations")
async def ml_recommendations(request: RecommendationRequest):
    return await get_recommendations(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")