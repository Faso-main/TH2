# recommendation_api.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import json
import pickle
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
import re
from collections import defaultdict, Counter
import warnings
import logging
from datetime import datetime
import os

warnings.filterwarnings('ignore')

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

class RecommendationModel:
    def __init__(self, templates_path, products_path=None):
        self.templates = self._load_templates(templates_path)
        self.products_df = self._load_products_safe(products_path) if products_path else None
        self.user_profiles = {}
        self.product_catalog_info = {}
        self.available_products = set()
        
        self._integrate_data()
        self._build_similarity_matrix()
        self._extract_available_products()
        
        logger.info(f"Model initialized with {len(self.product_catalog_info)} products")
    
    def _load_templates(self, templates_path):
        with open(templates_path, 'r', encoding='utf-8') as f:
            templates = json.load(f)
        logger.info(f"Loaded {len(templates)} procurement templates")
        return templates
    
    def _load_products_safe(self, products_path):
        try:
            df = pd.read_csv(products_path, encoding='utf-8-sig', sep=';', low_memory=False, on_bad_lines='skip')
            logger.info(f"Loaded {len(df)} products from catalog")
            return df
        except Exception as e:
            logger.error(f"Error loading catalog: {e}")
            return None

    def _integrate_data(self):
        logger.info("Integrating data sources...")
        
        template_ids = set()
        for template_data in self.templates.values():
            template_ids.update(template_data.get('typical_products', []))
        
        logger.info(f"Found {len(template_ids)} unique IDs in templates")
        
        if self.products_df is not None:
            self._match_catalog_products(template_ids)
        
        logger.info(f"Final mapping: {len(self.product_catalog_info)} products")

    def _match_catalog_products(self, template_ids):
        logger.info("Matching with product catalog...")
        
        matched_count = 0
        
        for col in self.products_df.columns:
            if matched_count >= len(template_ids):
                break
                
            for idx, row in self.products_df.iterrows():
                if matched_count >= len(template_ids):
                    break
                    
                try:
                    possible_ids = self._extract_possible_ids(row, col)
                    
                    for product_id in possible_ids:
                        if product_id in template_ids and product_id not in self.product_catalog_info:
                            product_name = self._find_product_name(row)
                            product_category = self._find_product_category(row)
                            
                            self.product_catalog_info[product_id] = {
                                'name': product_name,
                                'category': product_category,
                                'source': 'catalog',
                                'full_data': row.to_dict()
                            }
                            matched_count += 1
                            
                            if matched_count % 100 == 0:
                                logger.info(f"Matched {matched_count} products...")
                            
                            break
                
                except Exception:
                    continue
        
        logger.info(f"Total matched: {matched_count} products")

    def _extract_possible_ids(self, row, current_col):
        possible_ids = []
        
        main_id = str(row[current_col]).strip()
        if main_id and main_id != 'nan' and main_id != 'None':
            possible_ids.append(main_id)
            
            if not main_id.isdigit():
                numbers = re.findall(r'\d+', main_id)
                for num in numbers:
                    if len(num) >= 6:
                        possible_ids.append(num)
        
        return list(set(possible_ids))

    def _find_product_name(self, row):
        name_priority = ['наименование', 'название', 'name', 'product', 'товар']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in name_priority):
                value = str(row[col])
                if value and value != 'nan' and len(value) > 3:
                    return value
        
        for col in row.index:
            value = str(row[col])
            if value and value != 'nan' and len(value) > 10 and not value.isdigit():
                return value[:100]
        
        return "Name not specified"

    def _find_product_category(self, row):
        category_priority = ['категория', 'category', 'тип', 'group', 'class']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in category_priority):
                value = str(row[col])
                if value and value != 'nan' and len(value) > 2:
                    return value
        
        product_name = self._find_product_name(row).lower()
        
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'бумага', 'блокнот', 'клей', 'ластик', 'линейка', 'закладк', 'степлер', 'скоба', 'корректирующ', 'кнопк', 'ножниц', 'подставк', 'канцелярск'],
            'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'картридж', 'тонер', 'расходные материалы'],
            'Мебель': ['стол', 'кресло', 'стул', 'шкаф', 'полка', 'мебель', 'подставк'],
            'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'роутер', 'сетевой', 'микропроцессор'],
            'Хозтовары': ['моющее', 'чистящее', 'туалетная', 'бумага', 'мыло', 'порошок', 'дезодорирован'],
            'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительный']
        }
        
        for category, keywords in category_keywords.items():
            if any(keyword in product_name for keyword in keywords):
                return category
        
        return "Другое"

    def _extract_available_products(self):
        for product_id in self.product_catalog_info.keys():
            self.available_products.add(product_id)
        
        logger.info(f"Available products: {len(self.available_products)}")

    def _build_similarity_matrix(self):
        logger.info("Building similarity matrix...")
        
        product_contexts = {}
        
        for product_id in self.product_catalog_info.keys():
            product_info = self.product_catalog_info[product_id]
            contexts = []
            
            contexts.append(f"name_{product_info['name'][:30].replace(' ', '_')}")
            contexts.append(f"category_{product_info['category'].replace(' ', '_')}")
            
            template_info = []
            for template_name, template_data in self.templates.items():
                if product_id in template_data.get('typical_products', []):
                    freq = template_data['product_frequencies'].get(product_id, 0)
                    template_info.append(f"{template_name}_{freq}")
            
            if template_info:
                contexts.extend(template_info)
            
            product_contexts[product_id] = contexts
        
        product_descriptions = {}
        for product, contexts in product_contexts.items():
            product_descriptions[product] = " ".join(contexts)
        
        if product_descriptions:
            self.product_ids = list(product_descriptions.keys())
            descriptions = [product_descriptions[pid] for pid in self.product_ids]
            
            self.vectorizer = TfidfVectorizer(
                min_df=1,
                max_df=0.9,
                ngram_range=(1, 2),
                max_features=1000
            )
            
            tfidf_matrix = self.vectorizer.fit_transform(descriptions)
            tfidf_matrix_normalized = normalize(tfidf_matrix, norm='l2', axis=1)
            self.similarity_matrix = cosine_similarity(tfidf_matrix_normalized)
            self.product_to_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
            
            logger.info(f"Built similarity matrix for {len(self.product_ids)} products")

    def get_product_info(self, product_id):
        if product_id in self.product_catalog_info:
            return self.product_catalog_info[product_id]
        
        return {
            'name': f'Product {product_id}',
            'category': 'Другое',
            'source': 'unknown'
        }

    def create_or_update_user_profile(self, user_id, procurement_history):
        """Создает или обновляет профиль пользователя на основе истории закупок"""
        user_profile = {
            'product_frequencies': Counter(),
            'preferred_categories': Counter(),
            'total_spent': 0,
            'procurement_count': len(procurement_history),
            'unique_products': set(),
            'category_weights': defaultdict(float),
            'purchased_products': set(),
            'last_updated': datetime.now().isoformat()
        }
        
        for procurement in procurement_history:
            products = procurement.get('products', [])
            price = procurement.get('estimated_price', 0)
            
            user_profile['product_frequencies'].update(products)
            user_profile['unique_products'].update(products)
            user_profile['purchased_products'].update(products)
            user_profile['total_spent'] += price
            
            for product in products:
                product_info = self.get_product_info(product)
                category = product_info['category']
                user_profile['preferred_categories'][category] += 1
        
        total_products = sum(user_profile['preferred_categories'].values())
        if total_products > 0:
            for category, count in user_profile['preferred_categories'].items():
                user_profile['category_weights'][category] = count / total_products
        
        self.user_profiles[user_id] = user_profile
        
        logger.info(f"Updated profile for user {user_id}: {user_profile['procurement_count']} procurements, {len(user_profile['unique_products'])} products")
        
        return user_profile

    def get_similar_products(self, target_product_id, top_n=5):
        """Находит похожие товары"""
        if target_product_id not in self.product_to_index:
            return []
        
        target_idx = self.product_to_index[target_product_id]
        similarities = self.similarity_matrix[target_idx]
        
        similar_indices = np.argsort(similarities)[::-1][1:top_n*2]
        
        similar_products = []
        seen_names = set()
        
        for idx in similar_indices:
            similar_product_id = self.product_ids[idx]
            if similar_product_id in self.available_products:
                product_info = self.get_product_info(similar_product_id)
                similarity_score = similarities[idx]
                
                if product_info['name'] not in seen_names:
                    seen_names.add(product_info['name'])
                    
                    similar_products.append({
                        'product_id': similar_product_id,
                        'product_name': product_info['name'],
                        'product_category': product_info['category'],
                        'similarity_score': round(similarity_score, 4),
                        'reason': f'Похож на "{self.get_product_info(target_product_id)["name"]}"'
                    })
                
                if len(similar_products) >= top_n:
                    break
        
        return similar_products

    def get_recommendations(self, user_id, top_n=15):
        """Генерирует персонализированные рекомендации"""
        if user_id not in self.user_profiles:
            return []
        
        user_profile = self.user_profiles[user_id]
        user_products = set(user_profile['product_frequencies'].keys())
        
        recommendations = []
        
        # 1. Рекомендации на основе похожих товаров
        for purchased_product in list(user_profile['purchased_products'])[:10]:  # Ограничиваем для производительности
            if purchased_product in self.product_to_index:
                similar_products = self.get_similar_products(purchased_product, top_n=2)
                
                for similar in similar_products:
                    if (similar['product_id'] not in user_products and 
                        similar['product_id'] in self.available_products):
                        
                        recommendations.append({
                            'product_id': similar['product_id'],
                            'product_name': similar['product_name'],
                            'product_category': similar['product_category'],
                            'total_score': similar['similarity_score'] + 0.3,
                            'reason': similar['reason'],
                            'type': 'similar_to_purchased'
                        })
        
        # 2. Рекомендации из шаблонов
        for template_name, template_data in self.templates.items():
            template_products = template_data.get('typical_products', [])
            template_frequencies = template_data.get('product_frequencies', {})
            
            for product_id in template_products[:10]:  # Ограничиваем
                if (product_id not in user_products and 
                    product_id in self.available_products):
                    
                    product_info = self.get_product_info(product_id)
                    frequency = template_frequencies.get(product_id, 0)
                    
                    base_score = min(frequency / 1000, 1.0)
                    category_weight = user_profile['category_weights'].get(product_info['category'], 0.1)
                    personalization_bonus = category_weight * 0.5
                    
                    total_score = base_score + personalization_bonus
                    
                    reason = self._generate_recommendation_reason(
                        product_info['category'], 
                        user_profile['preferred_categories'],
                        frequency
                    )
                    
                    recommendations.append({
                        'product_id': product_id,
                        'product_name': product_info['name'],
                        'product_category': product_info['category'],
                        'total_score': round(total_score, 4),
                        'reason': reason,
                        'type': 'popular_in_category'
                    })
        
        # Убираем дубликаты и сортируем
        unique_recommendations = {}
        for rec in recommendations:
            name_key = rec['product_name']
            if name_key not in unique_recommendations:
                unique_recommendations[name_key] = rec
            else:
                existing = unique_recommendations[name_key]
                existing['total_score'] = max(existing['total_score'], rec['total_score'])
        
        final_recommendations = sorted(unique_recommendations.values(), 
                                     key=lambda x: x['total_score'], reverse=True)
        
        return final_recommendations[:top_n]

    def _generate_recommendation_reason(self, product_category, user_categories, frequency):
        if product_category in user_categories:
            return f"Соответствует вашим интересам в категории '{product_category}'"
        elif frequency > 100:
            return f"Популярный товар (используется в {frequency} закупках)"
        else:
            return "Рекомендовано на основе анализа закупок"

    def generate_procurement_bundle(self, user_id, target_budget=50000, max_items=10):
        """Генерирует набор товаров для закупки"""
        recommendations = self.get_recommendations(user_id, max_items * 3)
        
        if not recommendations:
            return {"error": "Не удалось сгенерировать рекомендации"}
        
        def estimate_price(product_info):
            category = product_info['category'].lower()
            name = product_info['name'].lower()
            
            price_estimates = {
                'канцелярия': 1000,
                'хозтовары': 2000,
                'офисная техника': 8000,
                'it оборудование': 15000,
                'мебель': 25000,
                'строительные материалы': 12000,
                'default': 5000
            }
            
            for price_category, price in price_estimates.items():
                if price_category in category or price_category in name:
                    return price
            
            return price_estimates['default']
        
        selected_products = []
        current_cost = 0
        categories_covered = set()
        
        for rec in recommendations:
            if len(selected_products) >= max_items:
                break
                
            product_info = self.get_product_info(rec['product_id'])
            price = estimate_price(product_info)
            
            budget_ok = current_cost + price <= target_budget
            diversity_ok = (product_info['category'] not in categories_covered or 
                          len(categories_covered) < 3)
            
            if budget_ok and (diversity_ok or rec['total_score'] > 0.7):
                rec['estimated_price'] = price
                selected_products.append(rec)
                current_cost += price
                categories_covered.add(product_info['category'])
        
        return {
            'bundle_size': len(selected_products),
            'total_cost': current_cost,
            'budget_used': f"{(current_cost / target_budget * 100):.1f}%",
            'categories_covered': list(categories_covered),
            'products': selected_products
        }

# Инициализация модели
try:
    model = RecommendationModel(
        templates_path='import/procurement_templates.json',
        products_path='import/344608_СТЕ.csv'
    )
    logger.info("Recommendation model initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize model: {e}")
    model = None

# API endpoints
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy' if model else 'unhealthy',
        'model_initialized': model is not None,
        'products_count': len(model.product_catalog_info) if model else 0,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/recommendations/user/<user_id>', methods=['POST'])
def get_user_recommendations(user_id):
    """Получить рекомендации для пользователя"""
    if not model:
        return jsonify({'error': 'Model not initialized'}), 500
    
    try:
        data = request.get_json()
        procurement_history = data.get('procurement_history', [])
        
        # Обновляем профиль пользователя
        model.create_or_update_user_profile(user_id, procurement_history)
        
        # Получаем рекомендации
        recommendations = model.get_recommendations(user_id, top_n=15)
        
        return jsonify({
            'user_id': user_id,
            'recommendations_count': len(recommendations),
            'recommendations': recommendations,
            'generated_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/recommendations/bundle/<user_id>', methods=['POST'])
def generate_procurement_bundle(user_id):
    """Сгенерировать набор для закупки"""
    if not model:
        return jsonify({'error': 'Model not initialized'}), 500
    
    try:
        data = request.get_json()
        procurement_history = data.get('procurement_history', [])
        target_budget = data.get('target_budget', 50000)
        max_items = data.get('max_items', 10)
        
        # Обновляем профиль
        model.create_or_update_user_profile(user_id, procurement_history)
        
        # Генерируем набор
        bundle = model.generate_procurement_bundle(user_id, target_budget, max_items)
        
        return jsonify({
            'user_id': user_id,
            'bundle': bundle,
            'parameters': {
                'target_budget': target_budget,
                'max_items': max_items
            },
            'generated_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error generating bundle: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/recommendations/similar/<product_id>', methods=['GET'])
def get_similar_products(product_id):
    """Получить похожие товары"""
    if not model:
        return jsonify({'error': 'Model not initialized'}), 500
    
    try:
        similar_products = model.get_similar_products(product_id, top_n=5)
        
        return jsonify({
            'product_id': product_id,
            'similar_products': similar_products,
            'count': len(similar_products)
        })
        
    except Exception as e:
        logger.error(f"Error finding similar products: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<product_id>', methods=['GET'])
def get_product_info(product_id):
    """Получить информацию о товаре"""
    if not model:
        return jsonify({'error': 'Model not initialized'}), 500
    
    try:
        product_info = model.get_product_info(product_id)
        return jsonify(product_info)
    except Exception as e:
        logger.error(f"Error getting product info: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host="127.0.0.1", port=8000, debug=True)