import pandas as pd
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
import re
from collections import defaultdict, Counter
import warnings
warnings.filterwarnings('ignore')

class AdvancedProcurementConfig:
    # TF-IDF параметры
    TFIDF_MIN_DF = 1
    TFIDF_MAX_DF = 0.9
    TFIDF_NGRAM_RANGE = (1, 2)
    TFIDF_MAX_FEATURES = 2000
    
    # Веса для критериев
    WEIGHTS = {
        'category_match': 0.25,
        'region_match': 0.20,
        'price_similarity': 0.15,
        'purchase_history': 0.20,
        'semantic_similarity': 0.20
    }
    
    # Ценовые категории
    PRICE_ESTIMATES = {
        'канцелярия': {'min': 500, 'max': 3000, 'avg': 1000},
        'хозтовары': {'min': 1000, 'max': 5000, 'avg': 2000},
        'офисная техника': {'min': 5000, 'max': 15000, 'avg': 8000},
        'it оборудование': {'min': 10000, 'max': 30000, 'avg': 15000},
        'мебель': {'min': 15000, 'max': 50000, 'avg': 25000},
        'строительные материалы': {'min': 8000, 'max': 20000, 'avg': 12000},
        'default': {'min': 2000, 'max': 10000, 'avg': 5000}
    }

class HybridProcurementRecommender:
    def __init__(self, templates_path, products_path=None, procurement_data_path=None):
        self.config = AdvancedProcurementConfig()
        self.templates = self._load_templates(templates_path)
        self.products_df = self._load_products_safe(products_path) if products_path else None
        self.procurement_data = self._load_procurement_data(procurement_data_path) if procurement_data_path else None
        
        self.user_profiles = {}
        self.product_catalog_info = {}
        self.available_products = set()
        self.region_data = {}  # Данные по регионам/ИНН
        self.price_ranges = {}  # Ценовые диапазоны по категориям
        
        self._integrate_data()
        self._extract_region_data()
        self._build_price_ranges()
        self._extract_available_products()  # ДОБАВЛЕНО: сначала извлекаем доступные товары
        self._build_similarity_matrix()
    
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

    def _integrate_data(self):
        """Интеграция данных из всех источников"""
        print("Integrating data sources...")
        
        template_ids = set()
        for template_data in self.templates.values():
            template_ids.update(template_data.get('typical_products', []))
        
        print(f"Found {len(template_ids)} unique IDs in templates")
        
        if self.products_df is not None:
            self._match_catalog_products_enhanced(template_ids)  # УЛУЧШЕННЫЙ МЕТОД
        
        print(f"Final mapping: {len(self.product_catalog_info)} products")

    def _match_catalog_products_enhanced(self, template_ids):
        """Улучшенное сопоставление товаров из каталога"""
        print("Enhanced matching with product catalog...")
        
        matched_count = 0
        not_found_ids = list(template_ids.copy())
        
        # Стратегии поиска в порядке приоритета
        search_strategies = [
            self._search_exact_match,
            self._search_partial_match,
            self._search_numeric_columns,
            self._search_any_column_with_numbers
        ]
        
        for strategy in search_strategies:
            if not not_found_ids:
                break
                
            print(f"Trying strategy: {strategy.__name__}")
            current_matches = 0
            
            for product_id in not_found_ids[:]:  # Копируем для безопасного удаления
                result = strategy(product_id)
                if result:
                    self.product_catalog_info[product_id] = result
                    matched_count += 1
                    current_matches += 1
                    not_found_ids.remove(product_id)
                    
                    if matched_count % 5 == 0:
                        print(f"Matched {matched_count} products...")
            
            print(f"Strategy {strategy.__name__}: found {current_matches} matches")
        
        print(f"Total matched: {matched_count}/{len(template_ids)} products")
        if not_found_ids:
            print(f"Not found: {len(not_found_ids)} products")
            print(f"Sample not found IDs: {not_found_ids[:10]}")

    def _search_exact_match(self, product_id):
        """Точное совпадение в любой колонке"""
        if self.products_df is None:
            return None
            
        search_id = str(product_id).strip()
        
        for col in self.products_df.columns:
            try:
                mask = self.products_df[col].astype(str).str.strip() == search_id
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"exact_match_{col}")
            except:
                continue
        return None

    def _search_partial_match(self, product_id):
        """Частичное совпадение (ID содержится в строке)"""
        if self.products_df is None:
            return None
            
        search_id = str(product_id).strip()
        
        for col in self.products_df.columns:
            try:
                mask = self.products_df[col].astype(str).str.contains(search_id, na=False)
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"partial_match_{col}")
            except:
                continue
        return None

    def _search_numeric_columns(self, product_id):
        """Поиск в числовых колонках"""
        if self.products_df is None:
            return None
            
        search_id = str(product_id).strip()
        numeric_cols = self.products_df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            try:
                mask = self.products_df[col].astype(str).str.strip() == search_id
                if mask.any():
                    matching_row = self.products_df[mask].iloc[0]
                    return self._create_product_info(matching_row, f"numeric_{col}")
            except:
                continue
        return None

    def _search_any_column_with_numbers(self, product_id):
        """Поиск по всем колонкам с извлечением чисел"""
        if self.products_df is None:
            return None
            
        search_id = str(product_id).strip()
        
        for idx, row in self.products_df.iterrows():
            for col in row.index:
                cell_value = str(row[col])
                # Ищем числа в ячейке
                numbers = re.findall(r'\d+', cell_value)
                if search_id in numbers:
                    return self._create_product_info(row, f"extracted_{col}")
        return None

    def _create_product_info(self, row, source):
        """Создает информацию о товаре из строки каталога"""
        return {
            'name': self._find_product_name(row),
            'category': self._find_product_category(row),
            'price_range': self._estimate_price_range(row),
            'source': source,
            'full_data': row.to_dict()
        }

    def _find_product_name(self, row):
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

    def _find_product_category(self, row):
        """Извлекает категорию товара из строки каталога"""
        category_priority = ['категория', 'category', 'тип', 'group', 'class', 'вид', 'раздел']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in category_priority):
                value = str(row[col])
                if value and value != 'nan' and len(value) > 2:
                    return value
        
        # Пробуем определить категорию по названию
        product_name = self._find_product_name(row).lower()
        
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

    def _estimate_price_range(self, row):
        """Оценка ценового диапазона для товара"""
        category = self._find_product_category(row)
        
        if category in self.config.PRICE_ESTIMATES:
            price_config = self.config.PRICE_ESTIMATES[category]
            return {
                'min': price_config['min'],
                'max': price_config['max'],
                'avg': price_config['avg']
            }
        
        return self.config.PRICE_ESTIMATES['default']

    def _extract_available_products(self):
        """ДОБАВЛЕННЫЙ МЕТОД: Извлечение доступных товаров"""
        print("Extracting available products...")
        
        # Все товары из каталога считаем доступными
        for product_id in self.product_catalog_info.keys():
            self.available_products.add(product_id)
        
        # Также добавляем товары из шаблонов, даже если их нет в каталоге
        for template_data in self.templates.values():
            for product_id in template_data.get('typical_products', []):
                if product_id not in self.product_catalog_info:
                    # Создаем базовую информацию для товаров из шаблонов
                    self.product_catalog_info[product_id] = self._create_template_product_info(product_id)
                self.available_products.add(product_id)
        
        print(f"Available products: {len(self.available_products)}")

    def _create_template_product_info(self, product_id):
        """Создает информацию о товаре из шаблона"""
        category = "Другое"
        name = f"Товар {product_id}"
        
        # Пробуем определить категорию по шаблонам
        for template_name, template_data in self.templates.items():
            if product_id in template_data.get('typical_products', []):
                template_name_lower = template_data['name'].lower()
                if 'канцеляр' in template_name_lower:
                    category = 'Канцелярия'
                elif 'офис' in template_name_lower or 'техник' in template_name_lower:
                    category = 'Офисная техника'
                elif 'мебель' in template_name_lower:
                    category = 'Мебель'
                elif 'хоз' in template_name_lower:
                    category = 'Хозтовары'
                elif 'строитель' in template_name_lower:
                    category = 'Строительные материалы'
                elif 'it' in template_name_lower:
                    category = 'IT оборудование'
                break
        
        return {
            'name': name,
            'category': category,
            'price_range': self._estimate_price_range_from_category(category),
            'source': 'template'
        }

    def _estimate_price_range_from_category(self, category):
        """Оценка цены на основе категории"""
        if category in self.config.PRICE_ESTIMATES:
            price_config = self.config.PRICE_ESTIMATES[category]
            return {
                'min': price_config['min'],
                'max': price_config['max'],
                'avg': price_config['avg']
            }
        return self.config.PRICE_ESTIMATES['default']

    def _extract_region_data(self):
        """Извлечение данных по регионам из истории закупок"""
        print("Extracting region data from procurement history...")
        
        if self.procurement_data is None:
            print("No procurement data for region analysis")
            return
        
        # Анализируем региональные паттерны
        region_columns = ['inn', 'region', 'customer_region', 'supplier_region']
        
        for col in self.procurement_data.columns:
            col_lower = str(col).lower()
            if any(region_keyword in col_lower for region_keyword in ['инн', 'inn', 'регион', 'region']):
                print(f"Found region column: {col}")
                
                # Анализируем распределение по этому столбцу
                value_counts = self.procurement_data[col].value_counts().head(10)
                print(f"Top values in {col}:")
                for value, count in value_counts.items():
                    print(f"  {value}: {count}")

    def _build_price_ranges(self):
        """Построение ценовых диапазонов по категориям"""
        print("Building price ranges by category...")
        
        category_prices = defaultdict(list)
        
        # Анализируем цены из истории закупок
        if self.procurement_data is not None:
            price_columns = ['price', 'sum', 'amount', 'стоимость', 'цена']
            
            for _, row in self.procurement_data.iterrows():
                # Пробуем найти категорию и цену
                category = self._infer_category_from_row(row)
                price = self._extract_price_from_row(row)
                
                if category and price > 0:
                    category_prices[category].append(price)
        
        # Заполняем недостающие данные конфигурационными значениями
        for category, price_config in self.config.PRICE_ESTIMATES.items():
            if category not in category_prices or len(category_prices[category]) < 5:
                # Используем сконфигурированные значения
                avg_price = price_config['avg']
                category_prices[category] = [
                    avg_price * 0.5, avg_price * 0.8, 
                    avg_price, avg_price * 1.2, avg_price * 1.5
                ]
        
        # Сохраняем статистику по ценам
        for category, prices in category_prices.items():
            if prices:
                self.price_ranges[category] = {
                    'min': min(prices),
                    'max': max(prices),
                    'avg': np.mean(prices),
                    'std': np.std(prices) if len(prices) > 1 else prices[0] * 0.3
                }
        
        print(f"Built price ranges for {len(self.price_ranges)} categories")

    def _infer_category_from_row(self, row):
        """Определение категории из строки данных"""
        # Анализируем текстовые поля для определения категории
        text_columns = [col for col in row.index if isinstance(row[col], str)]
        
        for col in text_columns:
            text = str(row[col]).lower()
            
            category_keywords = {
                'Канцелярия': ['ручка', 'карандаш', 'бумага', 'блокнот', 'клей', 'канцеляр'],
                'Офисная техника': ['принтер', 'сканер', 'ксерокс', 'мфу', 'картридж'],
                'Мебель': ['стол', 'кресло', 'стул', 'шкаф', 'мебель'],
                'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'роутер'],
                'Хозтовары': ['мыло', 'туалетная', 'бумага', 'моющее'],
                'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительный']
            }
            
            for category, keywords in category_keywords.items():
                if any(keyword in text for keyword in keywords):
                    return category
        
        return None

    def _extract_price_from_row(self, row):
        """Извлечение цены из строки данных"""
        price_columns = ['price', 'sum', 'amount', 'стоимость', 'цена', 'total']
        
        for col in row.index:
            col_lower = str(col).lower()
            if any(price_keyword in col_lower for price_keyword in price_columns):
                try:
                    price = float(row[col])
                    if price > 0 and price < 1000000:  # Разумные пределы
                        return price
                except (ValueError, TypeError):
                    continue
        
        return 0

    def _build_similarity_matrix(self):
        """Построение матрицы схожести с учетом категорий и цен"""
        print("Building enhanced similarity matrix...")
        
        # Если нет товаров в каталоге, создаем пустую матрицу
        if not self.product_catalog_info:
            print("No products for similarity matrix")
            self.product_ids = []
            self.similarity_matrix = np.array([])
            self.product_to_index = {}
            return
        
        product_features = {}
        
        for product_id in self.product_catalog_info.keys():
            product_info = self.product_catalog_info[product_id]
            features = []
            
            # Текстовые признаки
            features.append(f"name_{product_info['name'][:30].replace(' ', '_')}")
            features.append(f"category_{product_info['category'].replace(' ', '_')}")
            
            # Ценовые признаки
            price_range = product_info['price_range']
            price_level = "budget" if price_range['avg'] < 3000 else "mid" if price_range['avg'] < 10000 else "premium"
            features.append(f"price_{price_level}")
            
            # Признаки из шаблонов
            template_info = []
            for template_name, template_data in self.templates.items():
                if product_id in template_data.get('typical_products', []):
                    freq = template_data['product_frequencies'].get(product_id, 0)
                    template_info.append(f"{template_name}_{freq}")
            
            if template_info:
                features.extend(template_info)
            
            product_features[product_id] = features
        
        # Создаем TF-IDF матрицу
        product_descriptions = {}
        for product, features in product_features.items():
            product_descriptions[product] = " ".join(features)
        
        if product_descriptions:
            self.product_ids = list(product_descriptions.keys())
            descriptions = [product_descriptions[pid] for pid in self.product_ids]
            
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
            
            print(f"Built similarity matrix for {len(self.product_ids)} products")

    # Остальные методы остаются без изменений...
    def create_user_profile(self, user_id, procurement_history, region_info=None):
        """Создание расширенного профиля пользователя"""
        user_profile = {
            'product_frequencies': Counter(),
            'preferred_categories': Counter(),
            'price_preferences': defaultdict(list),
            'region_info': region_info or {},
            'total_spent': 0,
            'procurement_count': len(procurement_history),
            'unique_products': set(),
            'category_weights': defaultdict(float),
            'price_ranges': defaultdict(dict),
            'purchased_products': set()
        }
        
        for procurement in procurement_history:
            products = procurement.get('products', [])
            price = procurement.get('estimated_price', 0)
            region = procurement.get('region')
            
            user_profile['product_frequencies'].update(products)
            user_profile['unique_products'].update(products)
            user_profile['purchased_products'].update(products)
            user_profile['total_spent'] += price
            
            if region:
                user_profile['region_info']['preferred_regions'] = user_profile['region_info'].get('preferred_regions', [])
                if region not in user_profile['region_info']['preferred_regions']:
                    user_profile['region_info']['preferred_regions'].append(region)
            
            for product in products:
                product_info = self.get_product_info(product)
                category = product_info['category']
                user_profile['preferred_categories'][category] += 1
                
                # Собираем ценовые предпочтения по категориям
                price_range = product_info.get('price_range', {})
                if 'avg' in price_range:
                    user_profile['price_preferences'][category].append(price_range['avg'])
        
        # Вычисляем веса категорий
        total_products = sum(user_profile['preferred_categories'].values())
        if total_products > 0:
            for category, count in user_profile['preferred_categories'].items():
                user_profile['category_weights'][category] = count / total_products
        
        # Вычисляем ценовые диапазоны по категориям
        for category, prices in user_profile['price_preferences'].items():
            if prices:
                user_profile['price_ranges'][category] = {
                    'min': min(prices),
                    'max': max(prices),
                    'avg': np.mean(prices),
                    'preferred': np.median(prices)
                }
        
        self.user_profiles[user_id] = user_profile
        
        # Логируем профиль
        top_categories = user_profile['preferred_categories'].most_common(3)
        categories_str = ", ".join([f"{cat}({count})" for cat, count in top_categories])
        
        print(f"User {user_id}: {user_profile['procurement_count']} procurements, "
              f"{len(user_profile['unique_products'])} products, "
              f"top categories: {categories_str}")
        
        if user_profile['region_info'].get('preferred_regions'):
            print(f"Preferred regions: {user_profile['region_info']['preferred_regions']}")
        
        return user_profile

    def calculate_product_score(self, product_id, user_profile):
        """Расчет комплексного скора для товара"""
        product_info = self.get_product_info(product_id)
        
        scores = {
            'category_match': 0,
            'region_match': 0, 
            'price_similarity': 0,
            'purchase_history': 0,
            'semantic_similarity': 0
        }
        
        weights = self.config.WEIGHTS
        
        # 1. Совпадение по категории
        category = product_info['category']
        if category in user_profile['category_weights']:
            scores['category_match'] = user_profile['category_weights'][category]
        
        # 2. Совпадение по региону (пока упрощенно)
        scores['region_match'] = 0.5  # Базовый score, можно улучшить
        
        # 3. Схожесть по цене
        price_range = product_info.get('price_range', {})
        if 'avg' in price_range and category in user_profile['price_ranges']:
            user_price_range = user_profile['price_ranges'][category]
            user_pref_price = user_price_range.get('preferred', user_price_range.get('avg', 0))
            product_price = price_range['avg']
            
            if user_pref_price > 0:
                price_diff = abs(product_price - user_pref_price) / user_pref_price
                scores['price_similarity'] = max(0, 1 - price_diff)
        
        # 4. История покупок (схожие товары)
        if user_profile['purchased_products']:
            # Находим максимальную схожесть с купленными товарами
            max_similarity = 0
            for purchased_id in user_profile['purchased_products']:
                if purchased_id in self.product_to_index and product_id in self.product_to_index:
                    similarity = self._get_product_similarity(purchased_id, product_id)
                    max_similarity = max(max_similarity, similarity)
            
            scores['purchase_history'] = max_similarity
        
        # 5. Семантическая схожесть (на основе TF-IDF)
        if product_id in self.product_to_index:
            # Усредненная схожесть со всеми товарами пользователя
            total_similarity = 0
            count = 0
            
            for purchased_id in user_profile['purchased_products']:
                if purchased_id in self.product_to_index:
                    similarity = self._get_product_similarity(purchased_id, product_id)
                    total_similarity += similarity
                    count += 1
            
            if count > 0:
                scores['semantic_similarity'] = total_similarity / count
        
        # Итоговый score
        total_score = sum(scores[factor] * weights[factor] for factor in scores)
        
        return {
            'total_score': total_score,
            'component_scores': scores,
            'explanation': self._generate_score_explanation(scores, product_info)
        }

    def _get_product_similarity(self, product_id1, product_id2):
        """Получение схожести между двумя товарами"""
        if (product_id1 in self.product_to_index and 
            product_id2 in self.product_to_index):
            
            idx1 = self.product_to_index[product_id1]
            idx2 = self.product_to_index[product_id2]
            
            return self.similarity_matrix[idx1, idx2]
        
        return 0

    def _generate_score_explanation(self, scores, product_info):
        """Генерация объяснения рекомендации"""
        explanations = []
        
        if scores['category_match'] > 0.3:
            explanations.append(f"соответствует вашим предпочтениям в категории '{product_info['category']}'")
        
        if scores['price_similarity'] > 0.7:
            explanations.append("подходит по ценовому диапазону")
        elif scores['price_similarity'] < 0.3:
            explanations.append("необычный для вашего ценового диапазона")
        
        if scores['purchase_history'] > 0.6:
            explanations.append("похож на ваши предыдущие покупки")
        
        if scores['semantic_similarity'] > 0.5:
            explanations.append("семантически близок к вашим товарам")
        
        return "; ".join(explanations) if explanations else "основано на общих паттернах закупок"

    def get_recommendations(self, user_id, top_n=15, diversity=True):
        """Получение рекомендаций с учетом всех критериев"""
        if user_id not in self.user_profiles:
            return []
        
        user_profile = self.user_profiles[user_id]
        user_products = user_profile['purchased_products']
        
        candidate_scores = []
        
        # Оцениваем все доступные товары
        for product_id in self.available_products:
            if product_id not in user_products:
                score_result = self.calculate_product_score(product_id, user_profile)
                
                if score_result['total_score'] > 0.1:  # Минимальный порог
                    product_info = self.get_product_info(product_id)
                    
                    candidate_scores.append({
                        'product_id': product_id,
                        'product_name': product_info['name'],
                        'product_category': product_info['category'],
                        'total_score': round(score_result['total_score'], 4),
                        'component_scores': score_result['component_scores'],
                        'explanation': score_result['explanation'],
                        'price_range': product_info.get('price_range', {}),
                        'in_catalog': product_id in self.product_catalog_info
                    })
        
        # Сортируем по убыванию скора
        candidate_scores.sort(key=lambda x: x['total_score'], reverse=True)
        
        # Применяем диверсификацию
        if diversity:
            return self._apply_diversification(candidate_scores, top_n)
        else:
            return candidate_scores[:top_n]

    def _apply_diversification(self, candidates, top_n):
        """Применение диверсификации рекомендаций"""
        selected = []
        selected_categories = set()
        
        for candidate in candidates:
            if len(selected) >= top_n:
                break
            
            category = candidate['product_category']
            
            # Штрафуем за повторяющиеся категории после 2-х товаров
            if len(selected_categories) >= 2 and category in selected_categories:
                # Снижаем score для диверсификации
                diversity_penalty = 0.2
                candidate['total_score'] = max(0, candidate['total_score'] - diversity_penalty)
            
            selected.append(candidate)
            selected_categories.add(category)
        
        # Пересортируем после применения диверсификации
        selected.sort(key=lambda x: x['total_score'], reverse=True)
        return selected[:top_n]

    def get_product_info(self, product_id):
        """Получение информации о товаре"""
        if product_id in self.product_catalog_info:
            return self.product_catalog_info[product_id]
        
        return {
            'name': f'Product {product_id}',
            'category': 'Другое',
            'source': 'unknown',
            'price_range': self.config.PRICE_ESTIMATES['default']
        }

    def generate_procurement_bundle(self, user_id, target_budget=50000, max_items=10):
        """Генерация набора для закупки"""
        recommendations = self.get_recommendations(user_id, max_items * 2)
        
        if not recommendations:
            return {"error": "Не удалось сгенерировать рекомендации"}
        
        selected_products = []
        current_cost = 0
        categories_covered = set()
        
        for rec in recommendations:
            if len(selected_products) >= max_items:
                break
                
            avg_price = rec['price_range'].get('avg', 5000)
            
            if current_cost + avg_price <= target_budget:
                rec['estimated_price'] = avg_price
                selected_products.append(rec)
                current_cost += avg_price
                categories_covered.add(rec['product_category'])
        
        return {
            'bundle_size': len(selected_products),
            'total_cost': current_cost,
            'budget_used': f"{(current_cost / target_budget * 100):.1f}%",
            'categories_covered': list(categories_covered),
            'products': selected_products
        }

# Тестовый сценарий
def test_hybrid_recommender():
    recommender = HybridProcurementRecommender(
        templates_path='clean_data/procurement_templates.json',
        products_path='ML/344608_СТЕ.csv', 
        procurement_data_path='clean_data/cleaned_procurement_data.csv'
    )
    
    # Тестовый пользователь с историей закупок
    user_history = [
        {
            'products': ['35482269', '36575879'],
            'estimated_price': 20000,
            'region': 'Москва'
        }
    ]
    
    region_info = {
        'preferred_regions': ['Москва', 'Московская область'],
        'inn_patterns': ['77']  # Московский регион
    }
    
    recommender.create_user_profile('test_user', user_history, region_info)
    
    # Получаем рекомендации
    recommendations = recommender.get_recommendations('test_user', top_n=10)
    
    print("\n" + "="*80)
    print("ГИБРИДНЫЕ РЕКОМЕНДАЦИИ (с учетом категорий, цен, регионов)")
    print("="*80)
    
    if not recommendations:
        print("Нет рекомендаций. Возможно, не удалось сопоставить товары.")
        return
    
    for i, rec in enumerate(recommendations, 1):
        catalog_mark = "✓" if rec['in_catalog'] else "✗"
        print(f"{i:2d}. [{catalog_mark}] {rec['product_name']}")
        print(f"     Категория: {rec['product_category']}")
        print(f"     Общий score: {rec['total_score']}")
        print(f"     Компоненты: {json.dumps(rec['component_scores'], indent=14, ensure_ascii=False)}")
        print(f"     Объяснение: {rec['explanation']}")
        print(f"     Цена: {rec['price_range'].get('avg', 0):,.0f} RUB")
        print()
    
    # Генерация набора
    bundle = recommender.generate_procurement_bundle('test_user', target_budget=30000, max_items=6)
    
    print("\n" + "="*80)
    print("ОПТИМАЛЬНЫЙ НАБОР ДЛЯ ЗАКУПКИ")
    print("="*80)
    
    if 'error' in bundle:
        print(f"Ошибка: {bundle['error']}")
        return
        
    print(f"Товаров: {bundle['bundle_size']}")
    print(f"Стоимость: {bundle['total_cost']:,.0f} RUB ({bundle['budget_used']} бюджета)")
    print(f"Категории: {', '.join(bundle['categories_covered'])}")
    
    print("\nСостав набора:")
    for i, product in enumerate(bundle['products'], 1):
        catalog_mark = "✓" if product['in_catalog'] else "✗"
        print(f"{i:2d}. [{catalog_mark}] {product['product_name']}")
        print(f"     Категория: {product['product_category']}")
        print(f"     Цена: {product['estimated_price']:,.0f} RUB")
        print(f"     Score: {product['total_score']}")

if __name__ == "__main__":
    test_hybrid_recommender()