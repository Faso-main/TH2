import pandas as pd
import numpy as np
import json
import torch
from transformers import AutoTokenizer, AutoModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
from collections import defaultdict, Counter
import warnings
warnings.filterwarnings('ignore')

class FixedProcurementRecommender:
    def __init__(self, templates_path, analysis_path, products_path, procurement_examples=None):
        self.templates = self._load_json(templates_path)
        self.analysis = self._load_json(analysis_path)
        self.products_df = self._load_products_fixed(products_path)
        self.procurement_examples = procurement_examples or []
        
        # Инициализация моделей
        self.tokenizer = AutoTokenizer.from_pretrained('cointegrated/rubert-tiny2')
        self.bert_model = AutoModel.from_pretrained('cointegrated/rubert-tiny2')
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.bert_model.to(self.device)
        self.bert_model.eval()
        
        self.tfidf_vectorizer = TfidfVectorizer(
            min_df=1, max_df=0.9, ngram_range=(1, 2), max_features=1000
        )
        
        # Строим каталог и модели
        self._build_enhanced_catalog()
        self._build_similarity_models()
        
        print(f"✅ Система инициализирована: {len(self.product_catalog)} товаров")

    def _load_json(self, path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _load_products_fixed(self, products_path):
        """Исправленная загрузка CSV с обработкой ошибок"""
        try:
            # Пробуем разные разделители и кодировки
            try:
                # Сначала пробуем с разделителем |
                df = pd.read_csv(products_path, encoding='utf-8-sig', sep='|', header=None, 
                               on_bad_lines='skip', low_memory=False)
                print(f"✅ Загружено с разделителем |: {len(df)} строк")
            except:
                try:
                    # Пробуем с разделителем ;
                    df = pd.read_csv(products_path, encoding='utf-8-sig', sep=';', header=None,
                                   on_bad_lines='skip', low_memory=False)
                    print(f"✅ Загружено с разделителем ;: {len(df)} строк")
                except:
                    # Пробуем с автоматическим определением
                    df = pd.read_csv(products_path, encoding='utf-8-sig', header=None,
                                   on_bad_lines='skip', low_memory=False, engine='python')
                    print(f"✅ Загружено с автоопределением: {len(df)} строк")
            
            # Очистка данных
            df = df.dropna(how='all')  # Удаляем полностью пустые строки
            df = df.reset_index(drop=True)
            
            print(f"📊 Структура данных: {df.shape[0]} строк, {df.shape[1]} колонок")
            if len(df) > 0:
                print(f"📋 Пример первой строки: {df.iloc[0].tolist()}")
            
            return df
            
        except Exception as e:
            print(f"❌ Критическая ошибка загрузки: {e}")
            # Создаем тестовые данные для продолжения работы
            return self._create_test_data()

    def _create_test_data(self):
        """Создает тестовые данные если файл не загружается"""
        print("🔄 Создание тестовых данных...")
        test_data = []
        
        # Тестовые товары на основе анализа закупок
        test_products = [
            {'id': '35482269', 'name': 'Ручка шариковая синяя', 'category': 'Канцелярия', 'price': 50.0},
            {'id': '36575879', 'name': 'Бумага офисная А4', 'category': 'Канцелярия', 'price': 300.0},
            {'id': '38461536', 'name': 'Средство чистящее универсальное', 'category': 'Хозтовары', 'price': 450.0},
            {'id': '1256880', 'name': 'Мыло жидкое антибактериальное', 'category': 'Хозтовары', 'price': 280.0},
            {'id': '1227473', 'name': 'Скрепки канцелярские', 'category': 'Канцелярия', 'price': 80.0},
            {'id': '38461610', 'name': 'Моющее средство для уборки', 'category': 'Хозтовары', 'price': 520.0},
        ]
        
        for product in test_products:
            test_data.append([
                product['id'], product['name'], product['category'], '', 'шт', 
                json.dumps({'Объем': 'стандарт', 'Назначение': 'офисное использование'}), 
                product['price'], 't'
            ])
        
        return pd.DataFrame(test_data)

    def _build_enhanced_catalog(self):
        """Строит каталог товаров с обработкой разных структур данных"""
        print("📦 Построение каталога товаров...")
        
        self.product_catalog = {}
        self.available_products = set()
        self.category_products = defaultdict(list)
        
        if self.products_df is None or len(self.products_df) == 0:
            print("❌ Нет данных для построения каталога")
            return
        
        successful_parses = 0
        
        for idx, row in self.products_df.iterrows():
            try:
                product_data = self._parse_product_row(row)
                if product_data:
                    product_id = product_data['id']
                    self.product_catalog[product_id] = product_data
                    
                    if product_data.get('available', False):
                        self.available_products.add(product_id)
                    
                    category = product_data['category']
                    self.category_products[category].append(product_id)
                    successful_parses += 1
                    
            except Exception as e:
                continue  # Пропускаем проблемные строки
        
        print(f"✅ Успешно обработано: {successful_parses} товаров")
        print(f"📊 Категории: {list(self.category_products.keys())}")

    def _parse_product_row(self, row):
        """Парсит строку с товаром из DataFrame"""
        try:
            # Берем первые 8 колонок (максимум что может быть)
            values = [str(row[i]) if i < len(row) and pd.notna(row[i]) else '' for i in range(8)]
            
            product_id = values[0].strip()
            if not product_id or product_id == 'nan':
                product_id = f"auto_{hash(str(values)) % 100000}"
            
            # Извлекаем название
            name = values[1].strip() if len(values) > 1 else f"Товар {product_id}"
            if not name or name == 'nan':
                name = f"Товар {product_id}"
            
            # Парсим атрибуты
            attributes = {}
            if len(values) > 5 and values[5].strip() and values[5] != 'nan':
                attributes = self._parse_attributes(values[5])
            
            # Определяем категорию
            category = self._determine_category(name, attributes)
            
            # Извлекаем цену
            price = 0.0
            if len(values) > 6 and values[6].strip() and values[6] != 'nan':
                try:
                    price = float(values[6])
                except:
                    price = self._estimate_price(category, name)
            else:
                price = self._estimate_price(category, name)
            
            # Определяем доступность
            available = False
            if len(values) > 7 and values[7].strip() and values[7] != 'nan':
                available = values[7].strip().lower() in ['t', 'true', '1', 'y', 'yes']
            
            return {
                'id': product_id,
                'name': name,
                'category': category,
                'price': price,
                'attributes': attributes,
                'available': available,
                'description': self._generate_description(name, category, attributes)
            }
            
        except Exception as e:
            return None

    def _parse_attributes(self, attr_str):
        """Парсит атрибуты товара"""
        try:
            if isinstance(attr_str, str) and attr_str.strip():
                # Пробуем как JSON
                try:
                    return json.loads(attr_str)
                except:
                    # Пробуем извлечь ключ-значения из текста
                    attrs = {}
                    # Ищем паттерны типа "ключ": "значение"
                    patterns = [
                        r'"([^"]+)"\s*:\s*"([^"]*)"',
                        r'"([^"]+)"\s*:\s*([^,}]+)',
                        r'(\w+)\s*:\s*"([^"]*)"',
                        r'(\w+)\s*:\s*([^,\n]+)'
                    ]
                    
                    for pattern in patterns:
                        matches = re.findall(pattern, attr_str)
                        for key, value in matches:
                            attrs[key.strip()] = value.strip()
                    
                    return attrs
        except:
            pass
        return {}

    def _determine_category(self, name, attributes):
        """Определяет категорию товара"""
        name_lower = name.lower()
        attrs_str = str(attributes).lower()
        
        category_keywords = {
            'Канцелярия': ['ручка', 'карандаш', 'бумага', 'блокнот', 'клей', 'ластик', 'степлер', 
                          'скрепк', 'папка', 'файл', 'маркер', 'тетрадь', 'скотч', 'линейка'],
            'Хозтовары': ['моющее', 'чистящ', 'мыло', 'дезинфицирующ', 'бельниц', 'гель', 
                         'средство', 'порошок', 'жидкость', 'отбелива', 'пятновыводитель'],
            'Офисная техника': ['принтер', 'сканер', 'мфу', 'картридж', 'тонер', 'копир', 'факс'],
            'IT оборудование': ['компьютер', 'ноутбук', 'сервер', 'роутер', 'монитор', 'клавиатура', 'мышь'],
            'Мебель': ['стол', 'кресло', 'стул', 'шкаф', 'мебель', 'диван', 'полка', 'стеллаж'],
            'Строительные материалы': ['краска', 'лак', 'инструмент', 'строительн', 'кисть', 'валик', 'шпатель'],
            'Бытовая химия': ['химия', 'освежитель', 'средство для', 'очиститель'],
            'Уборочный инвентарь': ['швабра', 'ведро', 'совок', 'щетка', 'перчатк', 'инвентар', 'тряпк']
        }
        
        # Проверяем название
        for category, keywords in category_keywords.items():
            if any(keyword in name_lower for keyword in keywords):
                return category
        
        # Проверяем атрибуты
        for category, keywords in category_keywords.items():
            if any(keyword in attrs_str for keyword in keywords):
                return category
        
        return 'Разное'

    def _estimate_price(self, category, name):
        """Оценивает цену товара"""
        base_prices = {
            'Канцелярия': 120,
            'Хозтовары': 380,
            'Офисная техника': 7500,
            'IT оборудование': 12500,
            'Мебель': 4500,
            'Строительные материалы': 950,
            'Бытовая химия': 280,
            'Уборочный инвентарь': 650,
            'Разное': 400
        }
        
        price = base_prices.get(category, 400)
        
        # Корректировка на основе названия
        name_lower = name.lower()
        if any(word in name_lower for word in ['премиум', 'профессиональ', 'professional']):
            price *= 1.5
        elif any(word in name_lower for word in ['эконом', 'бюджет', 'стандарт']):
            price *= 0.7
        
        # Корректировка на объем
        volume = self._extract_volume_from_name(name)
        if volume > 1000:
            price *= 2.5
        elif volume > 500:
            price *= 1.8
        elif volume > 0:
            price *= (volume / 200)  # Нормализация
        
        return round(price, 2)

    def _extract_volume_from_name(self, name):
        """Извлекает объем из названия товара"""
        name_lower = name.lower()
        
        volume_patterns = [
            r'(\d+)\s*мл', r'(\d+)\s*л', r'(\d+)\s*г', r'(\d+)\s*кг',
            r'(\d+)\s*ml', r'(\d+)\s*l', r'(\d+)\s*g', r'(\d+)\s*kg'
        ]
        
        for pattern in volume_patterns:
            matches = re.findall(pattern, name_lower)
            if matches:
                try:
                    volume = float(matches[0])
                    if 'кг' in name_lower or 'kg' in name_lower:
                        volume *= 1000
                    elif 'л' in name_lower or 'l' in name_lower:
                        volume *= 1000
                    return volume
                except:
                    continue
        
        return 0

    def _generate_description(self, name, category, attributes):
        """Генерирует описание для эмбеддингов"""
        description_parts = [name, category]
        
        if attributes:
            important_attrs = ['Назначение', 'Объем', 'Тип', 'Форма', 'Консистенция', 'Вид']
            for attr in important_attrs:
                if attr in attributes:
                    description_parts.append(f"{attr}: {attributes[attr]}")
        
        return ". ".join(description_parts)

    def _build_similarity_models(self):
        """Строит модели схожести"""
        print("🔍 Построение моделей схожести...")
        
        # TF-IDF
        product_descriptions = []
        self.product_ids = []
        
        for product_id, info in self.product_catalog.items():
            description = f"{info['name']} {info['category']} {info['description']}"
            product_descriptions.append(description)
            self.product_ids.append(product_id)
        
        if product_descriptions:
            self.tfidf_matrix = self.tfidf_vectorizer.fit_transform(product_descriptions)
            self.tfidf_similarity = cosine_similarity(self.tfidf_matrix)
            self.product_to_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
            print(f"✅ TF-IDF: матрица {self.tfidf_matrix.shape}")
        else:
            print("❌ Нет данных для TF-IDF")
            
        # BERT эмбеддинги (упрощенная версия для тестирования)
        self.bert_embeddings = {}
        print("✅ Модели схожести построены")

    def smart_recommendation(self, user_input, budget=50000, user_role="office_manager"):
        """
        Упрощенная функция рекомендаций для тестирования
        """
        print(f"\n🎯 ЗАПРОС: {user_input}")
        print(f"💰 Бюджет: {budget:,} руб.")
        print(f"👤 Роль: {user_role}")
        
        # Определяем категории из запроса
        categories = self._extract_categories_from_input(user_input)
        print(f"📋 Категории: {categories}")
        
        # Получаем рекомендации
        recommendations = self._get_recommendations_by_categories(categories, budget)
        
        return self._format_recommendations(recommendations, user_input, budget)

    def _extract_categories_from_input(self, user_input):
        """Извлекает категории из пользовательского ввода"""
        input_lower = user_input.lower()
        categories = set()
        
        category_mapping = {
            'Канцелярия': ['канцеляр', 'ручк', 'карандаш', 'бумаг', 'блокнот', 'скрепк', 'степлер', 'папк', 'маркер'],
            'Хозтовары': ['моющ', 'чистящ', 'дезинфицир', 'химия', 'бельниц', 'мыло', 'порошок', 'гель'],
            'Офисная техника': ['оргтехник', 'принтер', 'сканер', 'ксерокс', 'мфу', 'картридж'],
            'Мебель': ['мебель', 'стол', 'кресло', 'стул', 'шкаф'],
            'Бытовая химия': ['химия', 'отбелива', 'пятновыводитель', 'освежитель'],
        }
        
        for category, keywords in category_mapping.items():
            if any(keyword in input_lower for keyword in keywords):
                categories.add(category)
        
        return list(categories) if categories else ['Канцелярия', 'Хозтовары']  # Категории по умолчанию

    def _get_recommendations_by_categories(self, categories, budget):
        """Получает рекомендации по категориям"""
        recommendations = []
        
        for category in categories:
            category_products = self.category_products.get(category, [])
            
            for product_id in category_products[:10]:  # Берем первые 10 из каждой категории
                product_info = self.product_catalog[product_id]
                
                # Простой scoring
                score = 0.7
                if product_info['available']:
                    score += 0.2
                
                # Корректировка по цене
                price_ratio = product_info['price'] / (budget / 8)  # Предполагаем 8 товаров
                if price_ratio <= 0.3:
                    score += 0.1
                
                recommendations.append({
                    'product_id': product_id,
                    'category': category,
                    'score': min(score, 1.0),
                    'price': product_info['price'],
                    'product_info': product_info
                })
        
        # Сортируем и ограничиваем по бюджету
        sorted_recs = sorted(recommendations, key=lambda x: x['score'], reverse=True)
        return self._optimize_budget(sorted_recs, budget)

    def _optimize_budget(self, recommendations, budget):
        """Оптимизирует под бюджет"""
        selected = []
        current_cost = 0
        
        for rec in recommendations:
            if current_cost + rec['price'] <= budget:
                selected.append(rec)
                current_cost += rec['price']
            if len(selected) >= 15:  # Максимум 15 товаров
                break
        
        return selected

    def _format_recommendations(self, recommendations, user_input, budget):
        """Форматирует рекомендации"""
        total_cost = sum(rec['price'] for rec in recommendations)
        categories_covered = list(set(rec['category'] for rec in recommendations))
        
        result = {
            'query': user_input,
            'budget': budget,
            'total_recommendations': len(recommendations),
            'total_cost': total_cost,
            'budget_utilization': f"{(total_cost / budget * 100):.1f}%" if budget > 0 else "N/A",
            'categories_covered': categories_covered,
            'recommendations': []
        }
        
        for i, rec in enumerate(recommendations, 1):
            product_info = rec['product_info']
            
            recommendation = {
                'rank': i,
                'product_id': rec['product_id'],
                'name': product_info['name'],
                'category': rec['category'],
                'price': product_info['price'],
                'availability': '✅ В наличии' if product_info['available'] else '⚠️ Под заказ',
                'score': round(rec['score'], 3),
                'reason': self._generate_simple_reason(rec)
            }
            
            result['recommendations'].append(recommendation)
        
        return result

    def _generate_simple_reason(self, recommendation):
        """Генерирует простое обоснование"""
        reasons = []
        
        if recommendation['score'] > 0.8:
            reasons.append("Высокий приоритет")
        
        if recommendation['product_info']['available']:
            reasons.append("Быстрая поставка")
        
        if recommendation['price'] < 1000:
            reasons.append("Хорошая цена")
        
        return ", ".join(reasons) if reasons else "Рекомендовано"

# Тестирование системы
def quick_test():
    """Быстрый тест системы"""
    print("🚀 ЗАПУСК БЫСТРОГО ТЕСТА СИСТЕМЫ")
    print("=" * 60)
    
    try:
        recommender = FixedProcurementRecommender(
            templates_path='clean_data/procurement_templates.json',
            analysis_path='clean_data/procurement_analysis_report.json',
            products_path='ML/344608_СТЕ.csv'
        )
        
        # Тест 1: Канцелярия
        print("\n1. 📝 ТЕСТ: КАНЦЕЛЯРИЯ ДЛЯ ОФИСА")
        result1 = recommender.smart_recommendation(
            user_input="Нужны ручки, бумага и скрепки для офиса",
            budget=25000,
            user_role="office_manager"
        )
        _print_simple_result(result1)
        
        # Тест 2: Хозтовары
        print("\n2. 🧽 ТЕСТ: МОЮЩИЕ СРЕДСТВА")
        result2 = recommender.smart_recommendation(
            user_input="Моющие и дезинфицирующие средства для уборки",
            budget=35000,
            user_role="cleaner"
        )
        _print_simple_result(result2)
        
        # Тест 3: Смешанная закупка
        print("\n3. 🏢 ТЕСТ: ОФИСНЫЕ ТОВАРЫ")
        result3 = recommender.smart_recommendation(
            user_input="Все для офиса: канцелярия и хозтовары",
            budget=50000,
            user_role="office_manager"
        )
        _print_simple_result(result3)
        
    except Exception as e:
        print(f"❌ Ошибка при тестировании: {e}")
        import traceback
        traceback.print_exc()

def _print_simple_result(result):
    """Простой вывод результатов"""
    print(f"📦 Запрос: {result['query']}")
    print(f"💰 Бюджет: {result['budget']:,} руб.")
    print(f"🎯 Рекомендаций: {result['total_recommendations']}")
    print(f"💵 Стоимость: {result['total_cost']:,.0f} руб. ({result['budget_utilization']})")
    print(f"🏷️ Категории: {', '.join(result['categories_covered'])}")
    
    print("\nТоп-5 рекомендаций:")
    for rec in result['recommendations'][:5]:
        print(f"  {rec['rank']:2d}. {rec['name']} - {rec['price']:,.0f} руб. ({rec['availability']})")

# Запуск
if __name__ == "__main__":
    quick_test()