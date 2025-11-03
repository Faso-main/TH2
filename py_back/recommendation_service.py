import asyncpg
import pandas as pd
from combo3_step import HybridProcurementRecommender
import json
import asyncio
from datetime import datetime, timedelta
import os

class PGRecommendationService:
    def __init__(self):
        self.db_config = {
            'host': 'localhost',
            'database': 'pc_db',
            'user': 'store_app1',
            'password': '1234',
            'port': 5432
        }
        self.recommender = None
        self.user_cache = {}
    
    async def init_recommender(self):
        """Инициализация рекомендателя с данными из PostgreSQL"""
        print("Initializing recommender from PostgreSQL...")
        
        # Загружаем шаблоны из БД
        templates = await self.load_templates_from_pg()
        print(f"Loaded {len(templates)} templates")
        
        # Загружаем товары из БД
        products_df = await self.load_products_from_pg()
        print(f"Loaded {len(products_df)} products")
        
        # Создаем временные файлы для инициализации
        templates_path = "temp_templates.json"
        products_path = "temp_products.csv"
        
        # Сохраняем данные во временные файлы
        with open(templates_path, 'w', encoding='utf-8') as f:
            json.dump(templates, f, ensure_ascii=False, indent=2)
        
        products_df.to_csv(products_path, index=False, encoding='utf-8')
        
        # Инициализируем рекомендатель
        self.recommender = HybridProcurementRecommender(
            templates_path=templates_path,
            products_path=products_path,
            procurement_data_path=None  # Можно добавить историю закупок
        )
        
        print("Recommender initialized successfully")
    
    async def load_templates_from_pg(self):
        """Загрузка шаблонов из PostgreSQL"""
        conn = await asyncpg.connect(**self.db_config)
        try:
            # Получаем шаблоны
            templates_query = """
            SELECT 
                template_id,
                name,
                description,
                size_range,
                keywords,
                sample_size,
                avg_products_count,
                avg_price
            FROM procurement_templates
            """
            template_rows = await conn.fetch(templates_query)
            
            # Получаем товары для шаблонов
            products_query = """
            SELECT 
                tp.template_id,
                tp.product_id,
                tp.frequency,
                tp.position,
                p.name as product_name
            FROM template_products tp
            JOIN products p ON tp.product_id = p.product_id
            ORDER BY tp.template_id, tp.position
            """
            product_rows = await conn.fetch(products_query)
            
            # Формируем структуру шаблонов
            templates = {}
            for template in template_rows:
                template_id = template['template_id']
                
                # Находим товары этого шаблона
                template_products = [
                    row['product_id'] for row in product_rows 
                    if row['template_id'] == template_id
                ]
                
                # Формируем частоты товаров
                product_frequencies = {}
                for row in product_rows:
                    if row['template_id'] == template_id:
                        product_frequencies[row['product_id']] = row['frequency']
                
                templates[template_id] = {
                    'name': template['name'],
                    'description': template['description'],
                    'typical_products': template_products,
                    'product_frequencies': product_frequencies,
                    'size_range': template['size_range'],
                    'keywords': template['keywords'] or [],
                    'sample_size': template['sample_size'],
                    'avg_products_count': float(template['avg_products_count'] or 0),
                    'avg_price': float(template['avg_price'] or 0)
                }
            
            return templates
            
        except Exception as e:
            print(f"Error loading templates: {e}")
            return {}
        finally:
            await conn.close()
    
# В recommendation_service.py улучшим загрузку товаров

    async def load_products_from_pg(self):
        """Загрузка реальных товаров из PostgreSQL"""
        conn = await asyncpg.connect(**self.db_config)
        try:
            query = """
            SELECT 
                p.product_id,
                p.name,
                p.manufacturer,
                p.average_price,
                p.is_available,
                c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.is_available = true
            AND p.name IS NOT NULL 
            AND p.name != ''
            AND p.average_price > 0
            LIMIT 10000
            """
            
            rows = await conn.fetch(query)
            
            products_data = []
            for row in rows:
                products_data.append({
                    'product_id': row['product_id'],
                    'name': row['name'] or f"Товар {row['product_id']}",
                    'manufacturer': row['manufacturer'] or 'Не указан',
                    'average_price': float(row['average_price'] or 1000),
                    'is_available': row['is_available'],
                    'category_name': row['category_name'] or 'Другое'
                })
            
            print(f"Загружено {len(products_data)} реальных товаров из БД")
            return pd.DataFrame(products_data)
            
        except Exception as e:
            print(f"Ошибка загрузки товаров: {e}")
            return await self.load_minimal_products()
    
    async def get_user_recommendations(self, user_id, limit=15):
        """Получить рекомендации для пользователя"""
        # Проверяем кэш
        cache_key = f"{user_id}_{limit}"
        if cache_key in self.user_cache:
            cached_data = self.user_cache[cache_key]
            if datetime.now() - cached_data['timestamp'] < timedelta(hours=1):
                print(f"Using cached recommendations for user {user_id}")
                return cached_data['recommendations']
        
        print(f"Generating new recommendations for user {user_id}")
        
        # Загружаем историю закупок пользователя
        user_history = await self.get_user_procurement_history(user_id)
        
        if not user_history:
            print(f"No history for user {user_id}, returning popular items")
            return await self.get_popular_recommendations(limit)
        
        # Создаем профиль и получаем рекомендации
        self.recommender.create_user_profile(user_id, user_history)
        recommendations = self.recommender.get_recommendations(user_id, top_n=limit)
        
        # Преобразуем в JSON-сериализуемый формат
        serializable_recs = []
        for rec in recommendations:
            serializable_recs.append({
                'product_id': rec.get('product_id'),
                'product_name': rec.get('product_name'),
                'product_category': rec.get('product_category'),
                'total_score': float(rec.get('total_score', 0)),
                'price_range': rec.get('price_range', {}),
                'explanation': rec.get('explanation', ''),
                'in_catalog': rec.get('in_catalog', False)
            })
        
        # Кэшируем
        self.user_cache[cache_key] = {
            'recommendations': serializable_recs,
            'timestamp': datetime.now()
        }
        
        print(f"Generated {len(serializable_recs)} recommendations for user {user_id}")
        return serializable_recs
    
    async def get_user_procurement_history(self, user_id):
        """История закупок пользователя из PostgreSQL"""
        conn = await asyncpg.connect(**self.db_config)
        try:
            query = """
            SELECT 
                p.procurement_id,
                p.estimated_price,
                json_agg(pi.product_id) as product_ids
            FROM procurements p
            JOIN procurement_items pi ON p.procurement_id = pi.procurement_id
            WHERE p.user_id = $1
            GROUP BY p.procurement_id, p.estimated_price
            ORDER BY p.procurement_date DESC
            LIMIT 20
            """
            
            rows = await conn.fetch(query, user_id)
            
            history = []
            for row in rows:
                history.append({
                    'products': row['product_ids'] or [],
                    'estimated_price': float(row['estimated_price'] or 0)
                })
            
            print(f"Loaded {len(history)} procurement records for user {user_id}")
            return history
            
        except Exception as e:
            print(f"Error loading user history: {e}")
            return []
        finally:
            await conn.close()
    
    async def get_popular_recommendations(self, limit=15):
        """Популярные товары как fallback"""
        conn = await asyncpg.connect(**self.db_config)
        try:
            query = """
            SELECT 
                p.product_id,
                p.name as product_name,
                p.average_price,
                c.name as category_name,
                COUNT(pi.procurement_item_id) as purchase_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN procurement_items pi ON p.product_id = pi.product_id
            WHERE p.is_available = true
            GROUP BY p.product_id, p.name, p.average_price, c.name
            ORDER BY purchase_count DESC, p.average_price DESC
            LIMIT $1
            """
            
            rows = await conn.fetch(query, limit)
            
            recommendations = []
            for row in rows:
                recommendations.append({
                    'product_id': row['product_id'],
                    'product_name': row['product_name'],
                    'product_category': row['category_name'] or 'Другое',
                    'total_score': 0.7,  # Базовый score
                    'price_range': {
                        'avg': float(row['average_price'] or 0),
                        'source': 'popular_fallback'
                    },
                    'explanation': 'Популярный товар среди пользователей',
                    'in_catalog': True
                })
            
            return recommendations
            
        except Exception as e:
            print(f"Error loading popular items: {e}")
            return []
        finally:
            await conn.close()