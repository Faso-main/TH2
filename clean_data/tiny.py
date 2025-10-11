import pandas as pd
import numpy as np
import json
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer, 
    AutoModel, 
    AdamW, 
    get_linear_schedule_with_warmup
)
from sklearn.preprocessing import LabelEncoder
import re
from collections import defaultdict, Counter
import warnings
warnings.filterwarnings('ignore')

class ProcurementConfig:
    BERT_MODEL_NAME = 'cointegrated/rubert-tiny2'
    MAX_SEQUENCE_LENGTH = 128
    BATCH_SIZE = 16
    EPOCHS = 10
    LEARNING_RATE = 2e-5
    HIDDEN_DROPOUT_PROB = 0.3
    TOP_K_RECOMMENDATIONS = 15
    MIN_SIMILARITY_THRESHOLD = 0.7
    DIVERSITY_PENALTY = 0.1
    
    PRICE_ESTIMATES = {
        'канцелярия': 1000,
        'хозтовары': 2000,
        'офисная техника': 8000,
        'it оборудование': 15000,
        'мебель': 25000,
        'строительные материалы': 12000,
        'default': 5000
    }

class AdvancedProcurementRecommender:
    def __init__(self, templates_path, products_path=None, procurement_data_path=None):
        self.config = ProcurementConfig()
        self.templates = self._load_templates(templates_path)
        self.products_df = self._load_products_safe(products_path) if products_path else None
        self.procurement_data = self._load_procurement_data(procurement_data_path)
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.config.BERT_MODEL_NAME)
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        self.product_vocab = {}
        self.model = None
        self.user_profiles = {}
        self.product_catalog_info = {}
        self.available_products = set()
        
        self._integrate_catalog_data()
        self._prepare_data()
        self._build_product_embeddings()
    
    def _load_templates(self, templates_path):
        with open(templates_path, 'r', encoding='utf-8') as f:
            templates = json.load(f)
        print(f"Loaded {len(templates)} procurement templates")
        return templates
    
    def _load_products_safe(self, products_path):
        try:
            df = pd.read_csv(products_path, encoding='utf-8-sig', sep=';', low_memory=False, on_bad_lines='skip')
            print(f"Loaded {len(df)} products from catalog")
            print(f"Catalog columns: {df.columns.tolist()}")
            print(f"First few rows:\n{df.head(3)}")
            return df
        except Exception as e:
            print(f"Error loading catalog: {e}")
            return None
    
    def _load_procurement_data(self, procurement_data_path):
        try:
            if procurement_data_path.endswith('.csv'):
                df = pd.read_csv(procurement_data_path, encoding='utf-8-sig', low_memory=False)
            else:
                df = pd.read_excel(procurement_data_path)
            print(f"Loaded {len(df)} procurement records")
            return df
        except Exception as e:
            print(f"Error loading procurement data: {e}")
            return None

    def _integrate_catalog_data(self):
        """Интеграция данных из каталога товаров с детальной отладкой"""
        print("Integrating catalog data...")
        
        if self.products_df is None:
            print("No catalog data available")
            return
        
        # Собираем все ID товаров из шаблонов
        template_ids = set()
        for template_name, template_data in self.templates.items():
            products = template_data.get('typical_products', [])
            template_ids.update(products)
            print(f"Template '{template_name}': {len(products)} products")
        
        print(f"Total unique template products: {len(template_ids)}")
        print(f"Sample template IDs: {list(template_ids)[:10]}")
        
        # Анализируем структуру каталога
        print(f"Catalog shape: {self.products_df.shape}")
        print(f"Catalog dtypes:\n{self.products_df.dtypes}")
        
        # Ищем товары в каталоге
        matched_count = 0
        not_found_ids = []
        
        for product_id in template_ids:
            product_info = self._find_product_in_catalog_debug(product_id)
            if product_info:
                self.product_catalog_info[product_id] = product_info
                self.available_products.add(product_id)
                matched_count += 1
                if matched_count <= 5:  # Покажем первые 5 найденных
                    print(f"FOUND: {product_id} -> {product_info['name'][:50]}...")
            else:
                not_found_ids.append(product_id)
        
        print(f"\nCatalog integration results:")
        print(f"Matched: {matched_count}/{len(template_ids)} products")
        print(f"Not found: {len(not_found_ids)} products")
        if not_found_ids:
            print(f"Sample not found IDs: {not_found_ids[:10]}")
    
    def _find_product_in_catalog_debug(self, product_id):
        """Ищет товар в каталоге с детальной отладкой"""
        search_id = str(product_id).strip()
        
        # Пробуем разные стратегии поиска
        strategies = [
            self._search_exact_match,
            self._search_partial_match, 
            self._search_numeric_columns,
            self._search_any_column
        ]
        
        for strategy in strategies:
            result = strategy(search_id)
            if result:
                return result
        
        return None
    
    def _search_exact_match(self, product_id):
        """Точное совпадение в любой колонке"""
        for col in self.products_df.columns:
            try:
                mask = self.products_df[col].astype(str).str.strip() == product_id
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"exact_match_{col}")
            except:
                continue
        return None
    
    def _search_partial_match(self, product_id):
        """Частичное совпадение (ID содержится в строке)"""
        for col in self.products_df.columns:
            try:
                mask = self.products_df[col].astype(str).str.contains(product_id, na=False)
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"partial_match_{col}")
            except:
                continue
        return None
    
    def _search_numeric_columns(self, product_id):
        """Поиск в числовых колонках"""
        numeric_cols = self.products_df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            try:
                mask = self.products_df[col].astype(str).str.strip() == product_id
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"numeric_{col}")
            except:
                continue
        return None
    
    def _search_any_column(self, product_id):
        """Поиск по всем колонкам с извлечением чисел"""
        for idx, row in self.products_df.iterrows():
            for col in row.index:
                cell_value = str(row[col])
                # Ищем числа в ячейке
                numbers = re.findall(r'\d+', cell_value)
                if product_id in numbers:
                    return self._create_product_info(row, f"extracted_{col}")
        return None
    
    def _create_product_info(self, row, source):
        """Создает информацию о товаре из строки каталога"""
        return {
            'name': self._extract_product_name(row),
            'category': self._extract_product_category(row),
            'source': source,
            'full_data': row.to_dict()
        }
    
    def _extract_product_name(self, row):
        """Извлекает название товара из строки каталога"""
        name_priority = ['наименование', 'название', 'name', 'product', 'товар', 'описание', 'предмет']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in name_priority):
                value = str(row[col])
                if value and value != 'nan' and len(value) > 3:
                    return value
        
        # Если не нашли по приоритетным колонкам, ищем любую текстовую колонку
        for col in row.index:
            value = str(row[col])
            if (value and value != 'nan' and len(value) > 10 
                and not value.replace('.', '').replace(',', '').replace(' ', '').isdigit()):
                return value[:100]
        
        # Последний вариант - используем первую непустую колонку
        for col in row.index:
            value = str(row[col])
            if value and value != 'nan':
                return f"{value[:50]}..."
        
        return f"Product_{hash(str(row)) % 10000}"
    
    def _extract_product_category(self, row):
        """Извлекает категорию товара из строки каталога"""
        category_priority = ['категория', 'category', 'тип', 'group', 'class', 'вид', 'раздел']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in category_priority):
                value = str(row[col])
                if value and value != 'nan' and len(value) > 2:
                    return value
        
        # Пробуем определить категорию по названию
        product_name = self._extract_product_name(row).lower()
        
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'бумага', 'блокнот', 'клей', 'ластик', 'линейка', 
                          'закладк', 'степлер', 'скоба', 'корректирующ', 'кнопк', 'ножниц', 
                          'подставк', 'канцелярск', 'тетрадь', 'папка', 'файл', 'дозатор', 'маркер'],
            'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'картридж', 'тонер', 
                               'расходные материалы', 'копир', 'факс', 'бфу', 'оргтехника'],
            'Мебель': ['стол', 'кресло', 'стул', 'шкаф', 'полка', 'мебель', 'подставк', 
                      'диван', 'стеллаж', 'тумба', 'комод', 'гарнитур', 'офисная мебель'],
            'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'роутер', 'сетевой', 
                               'микропроцессор', 'монитор', 'клавиатура', 'мышь', 'наушник',
                               'видеокарта', 'оперативная память', 'процессор', 'материнская плата'],
            'Хозтовары': ['моющее', 'чистящее', 'туалетная', 'бумага', 'мыло', 'порошок', 
                         'дезодорирован', 'салфетк', 'губка', 'ведро', 'швабра', 'перчатк', 'хоз'],
            'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительный', 'кисть',
                                      'валик', 'шпатель', 'дрель', 'шуруповерт', 'смесь', 'строитель']
        }
        
        for category, keywords in category_keywords.items():
            if any(keyword in product_name for keyword in keywords):
                return category
        
        return "Другое"
    
    def _prepare_data(self):
        """Подготовка данных для обучения"""
        print("Preparing data for BERT training...")
        
        all_products = set()
        for template_data in self.templates.values():
            all_products.update(template_data.get('typical_products', []))
        
        if self.procurement_data is not None:
            for _, row in self.procurement_data.iterrows():
                products = self._extract_products_from_row(row)
                all_products.update(products)
        
        self.product_vocab = {pid: idx for idx, pid in enumerate(all_products)}
        self.reverse_product_vocab = {idx: pid for pid, idx in self.product_vocab.items()}
        
        print(f"Created vocabulary with {len(self.product_vocab)} products")
        print(f"Available in catalog: {len(self.available_products)} products")
    
    def _extract_products_from_row(self, row):
        """Извлекает ID товаров из строки данных закупок"""
        products = []
        for col in row.index:
            value = str(row[col])
            # Ищем числовые ID (6+ цифр)
            numbers = re.findall(r'\d{6,}', value)
            products.extend(numbers)
        return products
    
    def _build_product_embeddings(self):
        """Создает эмбеддинги товаров с помощью BERT"""
        print("Building product embeddings...")
        
        product_descriptions = {}
        for product_id in self.product_vocab.keys():
            product_info = self._get_product_info(product_id)
            description = f"{product_info['name']} {product_info['category']}"
            product_descriptions[product_id] = description
        
        self.product_embeddings = {}
        
        # Используем чистый BERT для эмбеддингов
        bert_model = AutoModel.from_pretrained(self.config.BERT_MODEL_NAME).to(self.device)
        bert_model.eval()
        
        batch_size = 16
        product_ids = list(product_descriptions.keys())
        
        print(f"Generating embeddings for {len(product_ids)} products...")
        
        for i in range(0, len(product_ids), batch_size):
            batch_ids = product_ids[i:i+batch_size]
            batch_descriptions = [product_descriptions[pid] for pid in batch_ids]
            
            inputs = self.tokenizer(
                batch_descriptions,
                padding=True,
                truncation=True,
                max_length=64,
                return_tensors='pt'
            ).to(self.device)
            
            with torch.no_grad():
                outputs = bert_model(**inputs)
                embeddings = outputs.last_hidden_state.mean(dim=1).cpu().numpy()
            
            for j, product_id in enumerate(batch_ids):
                self.product_embeddings[product_id] = embeddings[j]
            
            if (i // batch_size) % 10 == 0:
                print(f"Processed {min(i + batch_size, len(product_ids))}/{len(product_ids)} products")
        
        bert_model.cpu()
        del bert_model
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        
        print(f"Created embeddings for {len(self.product_embeddings)} products")
    
    def _get_product_info(self, product_id):
        """Получает информацию о товаре из каталога или шаблонов"""
        if product_id in self.product_catalog_info:
            return self.product_catalog_info[product_id]
        
        # Если нет в каталоге, создаем базовую информацию на основе шаблонов
        category = "Другое"
        for template_data in self.templates.values():
            if product_id in template_data.get('typical_products', []):
                # Пробуем определить категорию по названию шаблона
                template_name = template_data['name'].lower()
                if 'канцеляр' in template_name:
                    category = 'Канцелярия'
                elif 'офис' in template_name or 'техник' in template_name:
                    category = 'Офисная техника'
                elif 'мебель' in template_name:
                    category = 'Мебель'
                elif 'хоз' in template_name:
                    category = 'Хозтовары'
                elif 'строитель' in template_name:
                    category = 'Строительные материалы'
                elif 'it' in template_name:
                    category = 'IT оборудование'
                break
        
        return {
            'name': f'Товар {product_id}',
            'category': category,
            'source': 'template'
        }
    
    def create_user_profile(self, user_id, procurement_history):
        """Создает профиль пользователя с эмбеддингами"""
        user_profile = {
            'procurement_history': procurement_history,
            'product_embeddings': [],
            'preferred_categories': Counter(),
            'purchased_products': set(),
            'category_weights': defaultdict(float)
        }
        
        for procurement in procurement_history:
            user_profile['purchased_products'].update(procurement['products'])
            
            for product_id in procurement['products']:
                if product_id in self.product_embeddings:
                    user_profile['product_embeddings'].append(
                        self.product_embeddings[product_id]
                    )
                
                # Собираем категории
                product_info = self._get_product_info(product_id)
                category = product_info['category']
                user_profile['preferred_categories'][category] += 1
        
        # Усредняем эмбеддинги
        if user_profile['product_embeddings']:
            user_profile['average_embedding'] = np.mean(
                user_profile['product_embeddings'], axis=0
            )
        else:
            user_profile['average_embedding'] = None
        
        # Вычисляем веса категорий
        total_products = sum(user_profile['preferred_categories'].values())
        if total_products > 0:
            for category, count in user_profile['preferred_categories'].items():
                user_profile['category_weights'][category] = count / total_products
        
        self.user_profiles[user_id] = user_profile
        
        # Логируем профиль
        top_categories = user_profile['preferred_categories'].most_common(3)
        categories_str = ", ".join([f"{cat}({count})" for cat, count in top_categories])
        print(f"User {user_id}: {len(user_profile['purchased_products'])} products, "
              f"categories: {categories_str}")
        
        return user_profile
    
    def get_recommendations(self, user_id, top_k=None):
        """Получает рекомендации с использованием BERT эмбеддингов"""
        if top_k is None:
            top_k = self.config.TOP_K_RECOMMENDATIONS
        
        if user_id not in self.user_profiles:
            return []
        
        user_profile = self.user_profiles[user_id]
        
        if user_profile['average_embedding'] is None:
            return self._get_fallback_recommendations(user_profile)
        
        # Вычисляем схожесть с эмбеддингами товаров
        similarities = {}
        user_embedding = user_profile['average_embedding']
        
        for product_id, product_embedding in self.product_embeddings.items():
            if product_id not in user_profile['purchased_products']:
                similarity = self._cosine_similarity(user_embedding, product_embedding)
                
                # Учитываем предпочтения по категориям
                product_info = self._get_product_info(product_id)
                category_bonus = user_profile['category_weights'].get(product_info['category'], 0) * 0.3
                
                adjusted_similarity = similarity + category_bonus
                similarities[product_id] = adjusted_similarity
        
        # Сортируем по схожести
        sorted_products = sorted(
            similarities.items(), 
            key=lambda x: x[1], 
            reverse=True
        )
        
        # Применяем диверсификацию
        recommendations = self._diversify_recommendations(
            sorted_products[:top_k * 3],
            user_profile,
            top_k
        )
        
        return recommendations
    
    def _cosine_similarity(self, vec1, vec2):
        """Вычисляет косинусную схожесть"""
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return np.dot(vec1, vec2) / (norm1 * norm2)
    
    def _diversify_recommendations(self, candidate_products, user_profile, top_k):
        """Добавляет диверсификацию в рекомендации"""
        selected_products = []
        selected_categories = set()
        
        for product_id, similarity in candidate_products:
            if len(selected_products) >= top_k:
                break
            
            product_info = self._get_product_info(product_id)
            category = product_info['category']
            
            # Штрафуем за повторяющиеся категории
            category_penalty = 0
            if category in selected_categories and len(selected_categories) >= 2:
                category_penalty = self.config.DIVERSITY_PENALTY
            
            adjusted_score = similarity - category_penalty
            
            if adjusted_score >= self.config.MIN_SIMILARITY_THRESHOLD:
                selected_products.append({
                    'product_id': product_id,
                    'product_name': product_info['name'],
                    'product_category': category,
                    'similarity_score': round(similarity, 4),
                    'adjusted_score': round(adjusted_score, 4),
                    'reason': self._generate_recommendation_reason(
                        product_info, user_profile, similarity
                    ),
                    'in_catalog': product_id in self.available_products
                })
                selected_categories.add(category)
        
        return selected_products[:top_k]
    
    def _generate_recommendation_reason(self, product_info, user_profile, similarity):
        """Генерирует обоснование рекомендации"""
        category = product_info['category']
        
        if category in user_profile['preferred_categories']:
            freq = user_profile['preferred_categories'][category]
            return f"Соответствует вашим интересам в категории '{category}'"
        elif similarity > 0.9:
            return "Очень похож на ваши предыдущие закупки"
        elif similarity > 0.7:
            return "Похож на товары из вашей истории закупок"
        else:
            return "Популярный товар среди похожих организаций"
    
    def _get_fallback_recommendations(self, user_profile):
        """Резервный метод рекомендаций"""
        recommendations = []
        
        for template_name, template_data in self.templates.items():
            for product_id in template_data.get('typical_products', []):
                if product_id not in user_profile['purchased_products']:
                    product_info = self._get_product_info(product_id)
                    frequency = template_data['product_frequencies'].get(product_id, 0)
                    
                    recommendations.append({
                        'product_id': product_id,
                        'product_name': product_info['name'],
                        'product_category': product_info['category'],
                        'similarity_score': min(frequency / 1000, 1.0),
                        'adjusted_score': min(frequency / 1000, 1.0),
                        'reason': f"Популярный в шаблоне '{template_data['name']}'",
                        'in_catalog': product_id in self.available_products
                    })
        
        return sorted(recommendations, key=lambda x: x['adjusted_score'], reverse=True)[:self.config.TOP_K_RECOMMENDATIONS]
    
    def predict_procurement_bundle(self, user_id, target_budget=50000, max_items=10):
        """Генерирует набор для закупки на основе рекомендаций"""
        recommendations = self.get_recommendations(user_id, max_items * 2)
        
        if not recommendations:
            return {"error": "Не удалось сгенерировать рекомендации"}
        
        selected_products = []
        current_cost = 0
        categories_covered = set()
        
        for rec in recommendations:
            if len(selected_products) >= max_items:
                break
                
            product_info = self._get_product_info(rec['product_id'])
            price = self._estimate_price(product_info)
            
            if current_cost + price <= target_budget:
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
    
    def _estimate_price(self, product_info):
        """Оценивает цену товара на основе категории"""
        category = product_info['category'].lower()
        name = product_info['name'].lower()
        
        for price_category, price in self.config.PRICE_ESTIMATES.items():
            if price_category in category or price_category in name:
                return price
        
        return self.config.PRICE_ESTIMATES['default']

# Тестовый сценарий
def main():
    recommender = AdvancedProcurementRecommender(
        templates_path='clean_data/procurement_templates.json',
        products_path='ML/344608_СТЕ.csv',
        procurement_data_path='clean_data/cleaned_procurement_data.csv'
    )
    
    # Тестовый пользователь
    user_history = [
        {
            'products': ['35482269', '36575879'],
            'estimated_price': 20000
        }
    ]
    
    recommender.create_user_profile('test_user', user_history)
    
    # Получение рекомендаций
    recommendations = recommender.get_recommendations('test_user')
    
    print("\n" + "="*80)
    print("BERT-BASED РЕКОМЕНДАЦИИ")
    print("="*80)
    
    catalog_count = sum(1 for rec in recommendations if rec['in_catalog'])
    print(f"Товаров из каталога: {catalog_count}/{len(recommendations)}")
    print()
    
    for i, rec in enumerate(recommendations, 1):
        catalog_mark = "✓" if rec['in_catalog'] else "✗"
        print(f"{i:2d}. [{catalog_mark}] {rec['product_name']}")
        print(f"     Категория: {rec['product_category']}")
        print(f"     Схожесть: {rec['similarity_score']} (скорректированная: {rec['adjusted_score']})")
        print(f"     Причина: {rec['reason']}")
        print()
    
    # Генерация набора для закупки
    bundle = recommender.predict_procurement_bundle('test_user', target_budget=30000, max_items=8)
    
    print("\n" + "="*80)
    print("НАБОР ДЛЯ ЗАКУПКИ")
    print("="*80)
    print(f"Товаров: {bundle['bundle_size']}")
    print(f"Общая стоимость: {bundle['total_cost']:,.0f} RUB ({bundle['budget_used']} бюджета)")
    print(f"Категории: {', '.join(bundle['categories_covered'])}")
    
    print("\nСостав набора:")
    for i, product in enumerate(bundle['products'], 1):
        catalog_mark = "✓" if product['in_catalog'] else "✗"
        print(f"{i:2d}. [{catalog_mark}] {product['product_name']}")
        print(f"     Категория: {product['product_category']}")
        print(f"     Цена: {product['estimated_price']:,.0f} RUB")
        print(f"     Score: {product['adjusted_score']}")

if __name__ == "__main__":
    main()