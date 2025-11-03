import numpy as np
from collections import defaultdict, Counter
import logging
from typing import List, Dict, Any
import json

logger = logging.getLogger(__name__)

class SmartRecommendationEngine:
    def __init__(self, db_connector):
        self.db = db_connector
        self.config = {
            'weights': {
                'purchase_history': 0.35,      # История покупок
                'category_similarity': 0.25,   # Схожесть категорий
                'price_compatibility': 0.20,   # Совместимость по цене
                'popularity': 0.15,            # Популярность товара
                'availability': 0.05           # Доступность
            },
            'min_availability_score': 0.8,     # Минимальная доступность
            'price_tolerance': 0.3             # Допуск по цене (±30%)
        }
        
        # Кэш популярных товаров
        self.popular_products = []
    
    async def initialize(self):
        """Инициализация - загрузка популярных товаров"""
        self.popular_products = await self.db.get_popular_products(200)
        logger.info(f"Loaded {len(self.popular_products)} popular products")
    
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
        
        # Анализируем историю покупок
        for procurement in user_procurements:
            product_id = procurement['product_id']
            category = procurement['category_name']
            price = procurement['unit_price'] or procurement['average_price']
            
            profile['purchased_products'].add(product_id)
            profile['preferred_categories'][category] += 1
            profile['price_ranges'][category].append(price)
            profile['total_spent'] += price * procurement.get('quantity', 1)
        
        # Вычисляем среднюю цену
        total_items = sum(profile['preferred_categories'].values())
        if total_items > 0:
            profile['avg_price_per_item'] = profile['total_spent'] / total_items
        
        # Вычисляем веса категорий
        total_categories = sum(profile['preferred_categories'].values())
        if total_categories > 0:
            for category, count in profile['preferred_categories'].items():
                profile['category_weights'][category] = count / total_categories
        
        logger.info(f"👤 User profile: {total_items} items, {len(profile['preferred_categories'])} categories, avg price: {profile['avg_price_per_item']:.0f}")
        return profile
    
    def _calculate_purchase_history_score(self, product: Dict, user_profile: Dict) -> float:
        """Скор на основе истории покупок"""
        if not user_profile['purchased_products']:
            return 0.5  # Базовый скор если нет истории
        
        # Проверяем, покупал ли пользователь товары из той же категории
        product_category = product.get('category_name', 'Другое')
        category_weight = user_profile['category_weights'].get(product_category, 0)
        
        # Увеличиваем скор если пользователь покупал в этой категории
        return min(category_weight * 2.0, 1.0)
    
    def _calculate_category_similarity(self, product: Dict, user_profile: Dict) -> float:
        """Схожесть по категориям"""
        product_category = product.get('category_name', 'Другое')
        
        if not user_profile['preferred_categories']:
            return 0.3  # Базовый скор если нет предпочтений
        
        # Нормализуем количество покупок в категории
        max_count = max(user_profile['preferred_categories'].values())
        category_count = user_profile['preferred_categories'].get(product_category, 0)
        
        return category_count / max_count if max_count > 0 else 0
    
    def _calculate_price_compatibility(self, product: Dict, user_profile: Dict) -> float:
        """Совместимость по цене"""
        product_price = product.get('average_price', 0)
        user_avg_price = user_profile['avg_price_per_item']
        
        if user_avg_price == 0:
            return 0.5  # Базовый скор если нет данных о ценах
        
        # Вычисляем насколько цена товара близка к привычной пользователю
        price_ratio = min(product_price, user_avg_price) / max(product_price, user_avg_price)
        
        # Увеличиваем скор если цена в пределах допуска
        tolerance = self.config['price_tolerance']
        if abs(product_price - user_avg_price) <= user_avg_price * tolerance:
            return min(price_ratio + 0.3, 1.0)
        
        return price_ratio
    
    def _calculate_popularity_score(self, product: Dict) -> float:
        """Скор популярности товара"""
        product_id = product['product_id']
        
        # Ищем товар в списке популярных
        for popular_product in self.popular_products:
            if popular_product['product_id'] == product_id:
                # Нормализуем количество покупок (0-1)
                max_purchases = max(p['purchase_count'] for p in self.popular_products) if self.popular_products else 1
                return popular_product['purchase_count'] / max_purchases
        
        return 0.1  # Базовый скор для непопулярных товаров
    
    def _calculate_availability_score(self, product: Dict) -> float:
        """Скор доступности"""
        # Все товары из БД уже filtered по is_available = true
        return 1.0
    
    def _generate_explanation(self, product: Dict, user_profile: Dict, scores: Dict) -> str:
        """Генерация объяснения рекомендации"""
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
        
        if explanations:
            return "Рекомендуем: " + ", ".join(explanations)
        else:
            return "Персональная рекомендация на основе анализа закупок"
    
    async def get_personalized_recommendations(self, user_id: str, limit: int = 15) -> List[Dict]:
        """Умные персонализированные рекомендации"""
        
        # 1. Получаем историю пользователя
        user_procurements = await self.db.get_user_procurements(user_id)
        
        # 2. Получаем доступные товары
        available_products = await self.db.get_available_products(10000)
        
        # 3. Анализируем поведение пользователя
        user_profile = self._analyze_user_behavior(user_procurements)
        
        # 4. Получаем названия категорий для товаров
        for product in available_products:
            product['category_name'] = await self.db.get_category_name(product['category_id'])
        
        # 5. Генерируем рекомендации
        recommendations = []
        purchased_ids = user_profile['purchased_products']
        
        for product in available_products:
            # Пропускаем уже купленные товары
            if product['product_id'] in purchased_ids:
                continue
            
            # Вычисляем компоненты скора
            scores = {
                'purchase_history': self._calculate_purchase_history_score(product, user_profile),
                'category_similarity': self._calculate_category_similarity(product, user_profile),
                'price_compatibility': self._calculate_price_compatibility(product, user_profile),
                'popularity': self._calculate_popularity_score(product),
                'availability': self._calculate_availability_score(product)
            }
            
            # Вычисляем общий скор
            total_score = sum(
                scores[factor] * self.config['weights'][factor] 
                for factor in scores
            )
            
            # Добавляем в рекомендации если скор выше порога
            if total_score > 0.2:  # Минимальный порог
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
        
        logger.info(f"Generated {len(final_recommendations)} recommendations for user {user_id}")
        logger.info(f"Score range: {final_recommendations[0]['total_score'] if final_recommendations else 0:.3f} - {final_recommendations[-1]['total_score'] if final_recommendations else 0:.3f}")
        
        return final_recommendations