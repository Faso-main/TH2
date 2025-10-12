# main_bert.py - Production-ready система с BERT эмбеддингами
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
import numpy as np
from sklearn.preprocessing import normalize
import time
import asyncio

# BERT эмбеддинги
from sentence_transformers import SentenceTransformer
import torch

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="BERT-Powered Procurement Recommendations API")

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
    strategy: str = "balanced"  

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
    processing_time: float
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

class BERTRecommendationConfig:
    # Веса для факторов рекомендаций
    WEIGHTS = {
        'semantic_similarity': 0.45,    # Семантическая схожесть (BERT)
        'behavioral_patterns': 0.25,    # Поведенческие паттерны
        'business_rules': 0.20,         # Бизнес-правила (наличие, популярность)
        'price_affordability': 0.10     # Ценовая доступность
    }
    
    # Параметры BERT модели
    MODEL_NAME = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
    BATCH_SIZE = 64
    EMBEDDING_DIM = 384
    
    # Параметры диверсификации
    DIVERSITY = {
        'max_per_category': 3,
        'min_categories': 3,
        'category_penalty': 0.1
    }
    
    # Ценовые категории
    PRICE_LEVELS = {
        'budget': (0, 3000),
        'mid': (3000, 10000), 
        'premium': (10000, float('inf'))
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
                p.procurement_date,
                pr.description,
                pr.manufacturer
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
                    'category_name': row['category_name'] or 'Другое',
                    'quantity': row['quantity'] or 1,
                    'unit_price': float(row['unit_price']) if row['unit_price'] else 0,
                    'average_price': float(row['average_price']) if row['average_price'] else 0,
                    'description': row['description'],
                    'manufacturer': row['manufacturer']
                })
            
            logger.info(f"Loaded {len(procurements)} procurement items for user {user_id}")
            return procurements
            
        except Exception as e:
            logger.error(f"Error getting user procurements: {e}")
            return []
    
    async def get_available_products(self, limit: int = 15000) -> List[Dict]:
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
                p.created_at,
                (SELECT COUNT(*) FROM procurement_items pi WHERE pi.product_id = p.product_id) as purchase_count,
                (SELECT COUNT(DISTINCT user_id) FROM procurements pr 
                 JOIN procurement_items pi ON pr.procurement_id = pi.procurement_id 
                 WHERE pi.product_id = p.product_id) as unique_buyers
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.is_available = true 
            AND p.average_price > 0
            AND p.name IS NOT NULL
            AND LENGTH(TRIM(p.name)) > 3
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
                text_for_embedding = self._prepare_text_for_embedding(row)
                
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
                    'unique_buyers': row['unique_buyers'] or 0,
                    'text_for_embedding': text_for_embedding,
                    'features': self._extract_product_features(row)
                })
            
            logger.info(f"Loaded {len(products)} unique available products")
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
        normalized = re.sub(r'\s*\[.*?\]', '', normalized)
        
        return normalized.strip()
    
    def _improve_category(self, current_category: str, product_name: str) -> str:
        if current_category and current_category != 'Другое':
            return current_category
        
        name_lower = product_name.lower()
        
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'ластик', 'линейка', 'блокнот', 'тетрадь', 'скрепка', 
                          'степлер', 'дырокол', 'корректор', 'маркер', 'фломастер'],
            'Бумажная продукция': ['бумага', 'пленка', 'ламинирован', 'блок для записей', 'календарь'],
            'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'ламинатор', 'брошюратор', 'шредер'],
            'Расходные материалы': ['картридж', 'тонер', 'пленка', 'чернила', 'бумага', 'фотобумага'],
            'Электроника': ['usb', 'кабель', 'разветвитель', 'роутер', 'наушник', 'колонка', 'флеш', 'ssd'],
            'Хозтовары': ['мыло', 'туалетная', 'бумага', 'моющее', 'чистящ', 'перчатк', 'ведро', 'швабра'],
            'Мебель': ['стол', 'стул', 'кресло', 'шкаф', 'полка', 'стеллаж', 'тумба'],
            'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'монитор', 'клавиатура', 'мышь'],
            'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительный', 'кисть', 'валик'],
            'Спецодежда': ['костюм', 'куртк', 'брюк', 'рубашк', 'футболк', 'обув', 'каск']
        }
        
        for category, keywords in category_keywords.items():
            if any(keyword in name_lower for keyword in keywords):
                return category
        
        return 'Офисные товары'
    
    def _prepare_text_for_embedding(self, row) -> str:
        texts = []
        
        if row['name']:
            texts.append(str(row['name']))
        if row['category_name']:
            texts.append(str(row['category_name']))
        if row['description']:
            desc = str(row['description']).strip()
            if len(desc) > 10:
                texts.append(desc[:300])
        if row['manufacturer']:
            texts.append(str(row['manufacturer']))
        if row['specifications']:
            specs = str(row['specifications']).strip()
            if len(specs) > 10:
                texts.append(specs[:200])
        if row['unit_of_measure']:
            texts.append(str(row['unit_of_measure']))
                
        return ". ".join(texts)
    
    def _extract_product_features(self, row) -> Dict:
        features = {}
        
        if row['manufacturer']:
            features['manufacturer'] = str(row['manufacturer'])
        if row['unit_of_measure']:
            features['unit'] = str(row['unit_of_measure'])
        if row['specifications']:
            features['specs_length'] = len(str(row['specifications']))
            
        return features

class BERTRecommendationEngine:
    def __init__(self, db_service):
        self.db = db_service
        self.config = BERTRecommendationConfig()
        self.user_profiles = {}
        self.model = None
        self.product_embeddings = None
        self.product_features = {}
        self.product_ids = []
        self.embedding_index = None
        
    async def initialize_engine(self):
        start_time = time.time()
        
        try:
            logger.info(f"Loading BERT model: {self.config.MODEL_NAME}")
            self.model = SentenceTransformer(self.config.MODEL_NAME)
            
            if torch.cuda.is_available():
                self.model = self.model.to('cuda')
                logger.info("Using CUDA for BERT embeddings")
            else:
                logger.info("Using CPU for BERT embeddings")
            
            products = await self.db.get_available_products(12000)
            await self._build_semantic_index(products)
            
            init_time = time.time() - start_time
            logger.info(f"BERT engine initialized in {init_time:.2f}s with {len(products)} products")
            
        except Exception as e:
            logger.error(f"BERT engine initialization failed: {e}")
            raise
    
    async def _build_semantic_index(self, products: List[Dict]):
        if not products:
            raise ValueError("No products available for indexing")
        
        self.product_features = {p['product_id']: p for p in products}
        self.product_ids = list(self.product_features.keys())
        
        texts = [self.product_features[pid]['text_for_embedding'] for pid in self.product_ids]
        
        logger.info(f"Generating BERT embeddings for {len(texts)} products...")
        
        # Генерируем эмбеддинги батчами для оптимизации памяти
        embeddings = []
        for i in range(0, len(texts), self.config.BATCH_SIZE):
            batch_texts = texts[i:i + self.config.BATCH_SIZE]
            batch_embeddings = self.model.encode(
                batch_texts, 
                show_progress_bar=False,
                convert_to_tensor=False,
                normalize_embeddings=True
            )
            embeddings.append(batch_embeddings)
            
            if i % 1000 == 0:
                logger.info(f"Processed {i}/{len(texts)} products")
        
        self.product_embeddings = np.vstack(embeddings)
        logger.info(f"Embeddings shape: {self.product_embeddings.shape}")
        
        # Создаем mapping для быстрого поиска
        self.product_to_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
    
    def _get_semantic_similarity(self, product_id1: str, product_id2: str) -> float:
        if product_id1 not in self.product_to_index or product_id2 not in self.product_to_index:
            return 0.0
        
        idx1 = self.product_to_index[product_id1]
        idx2 = self.product_to_index[product_id2]
        
        # Cosine similarity для нормализованных векторов
        return float(np.dot(self.product_embeddings[idx1], self.product_embeddings[idx2]))
    
    def create_user_profile(self, user_id: str, procurements: List[Dict]) -> Dict:
        profile = {
            'purchased_products': set(),
            'product_frequencies': Counter(),
            'preferred_categories': Counter(),
            'price_preferences': defaultdict(list),
            'total_spent': 0,
            'total_items': 0,
            'category_weights': defaultdict(float),
            'price_ranges': defaultdict(dict),
            'semantic_centroid': None,  # Центроид эмбеддингов купленных товаров
            'behavioral_patterns': self._analyze_behavioral_patterns(procurements)
        }
        
        if not procurements:
            return profile
        
        purchased_embeddings = []
        
        for proc in procurements:
            product_id = proc['product_id']
            price = proc['unit_price'] or proc['average_price']
            quantity = proc['quantity']
            
            profile['purchased_products'].add(product_id)
            profile['product_frequencies'][product_id] += quantity
            profile['total_spent'] += price * quantity
            profile['total_items'] += quantity
            
            category = proc['category_name']
            profile['preferred_categories'][category] += quantity
            profile['price_preferences'][category].append(price)
            
            if product_id in self.product_to_index:
                idx = self.product_to_index[product_id]
                # Учитываем частоту покупки при вычислении центроида
                for _ in range(min(quantity, 3)):  # Ограничиваем влияние частых покупок
                    purchased_embeddings.append(self.product_embeddings[idx])
        
        # Вычисляем семантический центроид пользователя
        if purchased_embeddings:
            profile['semantic_centroid'] = np.mean(purchased_embeddings, axis=0)
            profile['semantic_centroid'] = normalize([profile['semantic_centroid']])[0]
        
        # Вычисляем веса категорий
        total_items = profile['total_items']
        if total_items > 0:
            for category, count in profile['preferred_categories'].items():
                profile['category_weights'][category] = count / total_items
        
        # Вычисляем ценовые диапазоны
        for category, prices in profile['price_preferences'].items():
            if prices:
                profile['price_ranges'][category] = {
                    'min': min(prices),
                    'max': max(prices),
                    'avg': np.mean(prices),
                    'median': np.median(prices)
                }
        
        top_categories = profile['preferred_categories'].most_common(3)
        logger.info(f"User profile created: {len(profile['purchased_products'])} products, "
                   f"{total_items} items, top categories: {top_categories}")
        
        self.user_profiles[user_id] = profile
        return profile
    
    def _analyze_behavioral_patterns(self, procurements: List[Dict]) -> Dict:
        patterns = {
            'avg_basket_size': np.mean([p.get('quantity', 1) for p in procurements]),
            'category_diversity': len(set(p['category_name'] for p in procurements)),
            'price_sensitivity': 0,
            'preferred_price_level': None
        }
        
        if procurements:
            prices = [p['unit_price'] or p['average_price'] for p in procurements if p.get('unit_price') or p.get('average_price')]
            if prices:
                patterns['price_sensitivity'] = np.std(prices) / np.mean(prices) if np.mean(prices) > 0 else 0
                
                avg_price = np.mean(prices)
                for level, (min_p, max_p) in self.config.PRICE_LEVELS.items():
                    if min_p <= avg_price < max_p:
                        patterns['preferred_price_level'] = level
                        break
        
        return patterns
    
    def calculate_product_score(self, product_id: str, user_profile: Dict) -> Dict:
        product = self.product_features.get(product_id)
        if not product:
            return {'total_score': 0, 'component_scores': {}, 'confidence': 0}
        
        scores = {
            'semantic_similarity': 0,
            'behavioral_patterns': 0,
            'business_rules': 0,
            'price_affordability': 0
        }
        
        weights = self.config.WEIGHTS
        
        # 1. Семантическая схожесть (BERT)
        if user_profile['semantic_centroid'] is not None and product_id in self.product_to_index:
            idx = self.product_to_index[product_id]
            product_embedding = self.product_embeddings[idx]
            semantic_sim = float(np.dot(user_profile['semantic_centroid'], product_embedding))
            scores['semantic_similarity'] = max(0, semantic_sim)  # Cosine similarity может быть отрицательной
        
        # 2. Поведенческие паттерны
        category = product['category_name']
        cat_weight = user_profile['category_weights'].get(category, 0)
        
        # Учитываем популярность товара
        popularity = min(product['purchase_count'] / 100, 1.0) if product['purchase_count'] > 0 else 0.1
        
        scores['behavioral_patterns'] = (cat_weight * 0.7 + popularity * 0.3)
        
        # 3. Бизнес-правила
        business_score = 0
        if product['is_available']:
            business_score += 0.6
        if product['purchase_count'] > 10:  # Проверенный товар
            business_score += 0.3
        if product.get('manufacturer'):  # Есть производитель
            business_score += 0.1
            
        scores['business_rules'] = business_score
        
        # 4. Ценовая доступность
        product_price = product['average_price']
        if product_price > 0 and user_profile['total_spent'] > 0:
            user_avg_price = user_profile['total_spent'] / user_profile['total_items']
            if user_avg_price > 0:
                # Мягкое сравнение цен
                price_ratio = min(product_price, user_avg_price) / max(product_price, user_avg_price)
                scores['price_affordability'] = price_ratio
        
        # Итоговый score
        total_score = sum(scores[factor] * weights[factor] for factor in scores)
        
        # Уверенность в рекомендации
        confidence = self._calculate_confidence(scores, product, user_profile)
        
        return {
            'total_score': total_score,
            'component_scores': scores,
            'confidence': confidence
        }
    
    def _calculate_confidence(self, scores: Dict, product: Dict, user_profile: Dict) -> float:
        confidence_factors = []
        
        # Фактор семантической схожести
        if scores['semantic_similarity'] > 0.3:
            confidence_factors.append(0.9)
        elif scores['semantic_similarity'] > 0.1:
            confidence_factors.append(0.6)
        else:
            confidence_factors.append(0.3)
        
        # Фактор данных о товаре
        data_quality = 0
        if len(product['name']) > 10:
            data_quality += 0.2
        if product['description'] and len(product['description']) > 20:
            data_quality += 0.2
        if product['manufacturer']:
            data_quality += 0.1
        if product['purchase_count'] > 5:
            data_quality += 0.3
        if product['is_available']:
            data_quality += 0.2
            
        confidence_factors.append(data_quality)
        
        # Фактор пользовательских данных
        if user_profile['total_items'] > 10:
            confidence_factors.append(0.8)
        elif user_profile['total_items'] > 0:
            confidence_factors.append(0.5)
        else:
            confidence_factors.append(0.2)
        
        return np.mean(confidence_factors)
    
    def _generate_explanation(self, scores: Dict, product: Dict, user_profile: Dict) -> str:
        explanations = []
        
        if scores['semantic_similarity'] > 0.5:
            explanations.append("семантически близок к вашим покупкам")
        elif scores['semantic_similarity'] > 0.2:
            explanations.append("похож на ваши товары по содержанию")
        
        category = product['category_name']
        if user_profile['category_weights'].get(category, 0) > 0.2:
            explanations.append("в часто покупаемой категории")
        elif user_profile['category_weights'].get(category, 0) > 0:
            explanations.append("в интересующей вас категории")
        
        if scores['business_rules'] > 0.8:
            explanations.append("популярный и доступный товар")
        elif scores['business_rules'] > 0.6:
            explanations.append("проверенный выбор")
        
        if scores['price_affordability'] > 0.8:
            explanations.append("идеально по бюджету")
        elif scores['price_affordability'] > 0.6:
            explanations.append("подходит по цене")
        
        if explanations:
            return "Рекомендуем: " + ", ".join(explanations)
        else:
            return "Интересное предложение на основе вашей активности"
    
    async def generate_recommendations(self, user_id: str, limit: int = 15, strategy: str = "balanced"):
        start_time = time.time()
        
        user_procurements = await self.db.get_user_procurements(user_id)
        if user_id not in self.user_profiles:
            self.create_user_profile(user_id, user_procurements)
        
        user_profile = self.user_profiles[user_id]
        purchased_products = user_profile['purchased_products']
        
        candidates = []
        seen_names = set()
        
        # Оцениваем все товары кроме купленных
        for product_id in self.product_ids:
            if product_id in purchased_products:
                continue
            
            product = self.product_features[product_id]
            if product['name'] in seen_names:
                continue
            seen_names.add(product['name'])
            
            score_result = self.calculate_product_score(product_id, user_profile)
            
            if score_result['total_score'] > 0.15:  # Более высокий порог для качества
                explanation = self._generate_explanation(score_result['component_scores'], product, user_profile)
                
                candidates.append({
                    'product_id': product_id,
                    'product_name': product['name'],
                    'product_category': product['category_name'],
                    'total_score': round(score_result['total_score'], 4),
                    'component_scores': score_result['component_scores'],
                    'confidence': round(score_result['confidence'], 3),
                    'explanation': explanation,
                    'price_range': {
                        'avg': product['average_price'],
                        'min': product['average_price'] * 0.8,
                        'max': product['average_price'] * 1.2,
                        'source': 'database'
                    },
                    'in_catalog': True,
                    'is_available': product['is_available'],
                    'purchase_count': product['purchase_count'],
                    'manufacturer': product.get('manufacturer')
                })
        
        # Применяем стратегию сортировки
        if strategy == "budget":
            candidates.sort(key=lambda x: x['price_range']['avg'])
        elif strategy == "premium":
            candidates.sort(key=lambda x: x['price_range']['avg'], reverse=True)
        else:  # balanced
            candidates.sort(key=lambda x: x['total_score'], reverse=True)
        
        # Диверсификация
        final_recommendations = self._apply_diversification(candidates, limit)
        
        processing_time = time.time() - start_time
        logger.info(f"BERT generated {len(final_recommendations)} recommendations for user {user_id} in {processing_time:.3f}s")
        
        return final_recommendations, processing_time
    
    def _apply_diversification(self, candidates: List[Dict], top_n: int) -> List[Dict]:
        if len(candidates) <= top_n:
            return candidates[:top_n]
        
        selected = []
        selected_categories = Counter()
        
        # Проходим по кандидатам в порядке убывания скора
        for candidate in candidates:
            if len(selected) >= top_n:
                break
                
            category = candidate['product_category']
            max_per_category = self.config.DIVERSITY['max_per_category']
            
            if selected_categories[category] < max_per_category:
                selected.append(candidate)
                selected_categories[category] += 1
        
        # Если не набрали достаточно, добавляем лучшие из оставшихся
        if len(selected) < top_n:
            remaining = [c for c in candidates if c not in selected]
            remaining.sort(key=lambda x: x['total_score'], reverse=True)
            selected.extend(remaining[:top_n - len(selected)])
        
        return selected[:top_n]
    
    async def generate_procurement_bundle(self, user_id: str, target_budget: float = 50000, 
                                        max_items: int = 10, strategy: str = "balanced"):
        recommendations, _ = await self.generate_recommendations(user_id, max_items * 3, strategy)
        
        if not recommendations:
            return {"error": "Не удалось сгенерировать рекомендации для набора"}
        
        selected_products = []
        current_cost = 0
        categories_covered = set()
        
        for rec in recommendations:
            if len(selected_products) >= max_items:
                break
                
            avg_price = rec['price_range']['avg']
            
            # Проверяем, влезает ли товар в бюджет
            if current_cost + avg_price <= target_budget:
                rec_copy = rec.copy()
                rec_copy['estimated_price'] = avg_price
                selected_products.append(rec_copy)
                current_cost += avg_price
                categories_covered.add(rec['product_category'])
        
        budget_utilization = (current_cost / target_budget) * 100 if target_budget > 0 else 0
        
        return {
            'bundle_size': len(selected_products),
            'total_cost': round(current_cost, 2),
            'budget_used_percent': round(budget_utilization, 1),
            'budget_remaining': round(target_budget - current_cost, 2),
            'categories_covered': list(categories_covered),
            'avg_confidence': round(np.mean([p['confidence'] for p in selected_products]), 3) if selected_products else 0,
            'strategy_used': strategy,
            'products': selected_products
        }

# Инициализация сервисов
db_service = DatabaseService()
bert_engine = BERTRecommendationEngine(db_service)

@app.on_event("startup")
async def startup_event():
    await db_service.connect()
    await bert_engine.initialize_engine()
    logger.info("BERT-Powered Recommendation API started successfully")

@app.get("/")
async def root():
    return {
        "message": "BERT-Powered Procurement Recommendations API", 
        "status": "running", 
        "version": "2.0-bert",
        "engine": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        "products_loaded": len(bert_engine.product_features),
        "embedding_dim": bert_engine.product_embeddings.shape[1] if bert_engine.product_embeddings is not None else 0
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
            "bert_engine": {
                "initialized": bert_engine.model is not None,
                "products_loaded": len(bert_engine.product_features),
                "embeddings_generated": bert_engine.product_embeddings is not None
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/api/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    try:
        logger.info(f"Getting BERT recommendations for user: {request.user_id}")
        
        recommendations, processing_time = await bert_engine.generate_recommendations(
            user_id=request.user_id,
            limit=request.limit,
            strategy=request.strategy
        )
        
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations_count=len(recommendations),
            recommendations=recommendations,
            engine="bert_v2",
            processing_time=processing_time,
            generated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"BERT recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bundle", response_model=BundleResponse)
async def generate_bundle(request: BundleRequest):
    try:
        logger.info(f"Generating BERT-powered procurement bundle for user: {request.user_id}")
        
        bundle = await bert_engine.generate_procurement_bundle(
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

@app.get("/api/engine-info")
async def get_engine_info():
    info = {
        "bert_model": bert_engine.config.MODEL_NAME,
        "embedding_dimension": bert_engine.config.EMBEDDING_DIM,
        "products_in_index": len(bert_engine.product_features),
        "user_profiles_loaded": len(bert_engine.user_profiles),
        "weights_config": bert_engine.config.WEIGHTS
    }
    return info

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")