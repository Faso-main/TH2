import asyncpg
import asyncio
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class DatabaseConnector:
    def __init__(self):
        self.pool = None
        
    async def connect(self):
        """Подключение к PostgreSQL БД"""
        try:
            self.pool = await asyncpg.create_pool(
                user='store_app1',
                host='localhost',
                database='pc_db',
                password='1234',
                port=5432,
                min_size=1,
                max_size=10
            )
            logger.info("Successfully connected to PostgreSQL database")
        except Exception as e:
            logger.error(f"Database connection error: {e}")
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
            
            rows = await self.pool.fetch(query, user_id)
            
            # Преобразуем в список словарей
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
                    'procurement_date': row['procurement_date']
                })
            
            logger.info(f"Loaded {len(procurements)} procurement items for user {user_id}")
            return procurements
            
        except Exception as e:
            logger.error(f"Error getting user procurements: {e}")
            return []
    
    async def get_available_products(self, limit: int = 15000) -> List[Dict]:
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
            
            rows = await self.pool.fetch(query, limit)
            
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
            row = await self.pool.fetchrow(query, category_id)
            return row['name'] if row else "Другое"
        except:
            return "Другое"
    
    async def get_popular_products(self, limit: int = 100) -> List[Dict]:
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
            
            rows = await self.pool.fetch(query, limit)
            
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