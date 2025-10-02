import requests
import json
import pandas as pd
from typing import Dict, List, Any

class MosZakupkiOfficialAPI:
    
    def __init__(self):
        self.base_url = "https://api.zakupki.mos.ru/api/v1"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })

    def get_contracts(self, take: int = 50, skip: int = 0) -> Dict:
        print("Получение данных о контрактах...")
        
        url = f"{self.base_url}/queries/GetContracts"
        
        query_params = {
            "take": take,
            "skip": skip,
            "withCount": True,
            "filter": {
                "conclusionDate": {
                    "from": "2024-01-01T00:00:00Z",
                    "to": "2024-12-31T23:59:59Z"
                }
            }
        }
        
        try:
            response = self.session.post(url, json=query_params)
            print(f"Статус запроса: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Успешно получено контрактов: {data.get('count', 0)}")
                return data
            else:
                print(f"Ошибка API: {response.status_code}")
                print(f"Текст ответа: {response.text}")
                return {}
                
        except Exception as e:
            print(f"Ошибка подключения: {e}")
            return {}

    def get_skus(self, take: int = 50, skip: int = 0) -> Dict:
        print("Получение данных о товарах (СТЕ)...")
        
        url = f"{self.base_url}/queries/GetSkus"
        
        query_params = {
            "take": take,
            "skip": skip,
            "withCount": True,
            "filter": {
                "hasOffers": True
            }
        }
        
        try:
            response = self.session.post(url, json=query_params)
            print(f"Статус запроса: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Успешно получено товаров: {data.get('count', 0)}")
                return data
            else:
                print(f"Ошибка API: {response.status_code}")
                return {}
                
        except Exception as e:
            print(f"Ошибка подключения: {e}")
            return {}

    def get_suppliers(self, take: int = 50, skip: int = 0) -> Dict:
        print("Получение данных о поставщиках...")
        
        url = f"{self.base_url}/queries/GetSuppliers"
        
        query_params = {
            "take": take,
            "skip": skip,
            "withCount": True
        }
        
        try:
            response = self.session.post(url, json=query_params)
            print(f"Статус запроса: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Успешно получено поставщиков: {data.get('count', 0)}")
                return data
            else:
                print(f"Ошибка API: {response.status_code}")
                return {}
                
        except Exception as e:
            print(f"Ошибка подключения: {e}")
            return {}

    def get_categories(self) -> Dict:
        print("Получение категорий товаров...")
        
        url = f"{self.base_url}/references/GetProductionDirectoryReference"
        
        try:
            response = self.session.post(url, json={})
            print(f"Статус запроса: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Успешно получено категорий: {len(data.get('items', []))}")
                return data
            else:
                print(f"Ошибка API: {response.status_code}")
                return {}
                
        except Exception as e:
            print(f"Ошибка подключения: {e}")
            return {}

    def parse_contracts_data(self, contracts_data: Dict) -> List[Dict]:
        print("Обработка данных контрактов...")
        
        contracts_list = []
        items = contracts_data.get('items', [])
        
        for contract in items:
            parsed_contract = {
                'id': contract.get('id'),
                'number': contract.get('number'),
                'name': contract.get('name'),
                'customer_name': contract.get('customer', {}).get('name'),
                'supplier_name': contract.get('supplier', {}).get('name'),
                'conclusion_date': contract.get('conclusionDate'),
                'completion_date': contract.get('completionDate'),
                'price': contract.get('price'),
                'currency': contract.get('currency'),
                'status': contract.get('status'),
                'law_type': contract.get('federalLaw')
            }
            contracts_list.append(parsed_contract)
        
        return contracts_list

    def parse_skus_data(self, skus_data: Dict) -> List[Dict]:
        print("Обработка данных товаров...")
        
        skus_list = []
        items = skus_data.get('items', [])
        
        for sku in items:
            parsed_sku = {
                'id': sku.get('id'),
                'name': sku.get('name'),
                'description': sku.get('description'),
                'brand': sku.get('brand'),
                'vendor': sku.get('vendor'),
                'country_of_origin': sku.get('countryOfOrigin'),
                'average_price': sku.get('averagePrice'),
                'currency': sku.get('currency'),
                'unit_of_measure': sku.get('unitOfMeasure'),
                'kpgz_code': sku.get('kpgzCode'),
                'okpd2_code': sku.get('okpd2Code'),
                'has_offers': sku.get('hasOffers'),
                'category_id': sku.get('categoryId')
            }
            
            characteristics = []
            for char in sku.get('characteristics', []):
                char_name = char.get('name', '')
                char_value = char.get('value', '')
                if char_name and char_value:
                    characteristics.append(f"{char_name}: {char_value}")
            
            parsed_sku['characteristics'] = ' | '.join(characteristics)
            skus_list.append(parsed_sku)
        
        return skus_list

    def save_to_csv(self, data: List[Dict], filename: str):
        if not data:
            print("Нет данных для сохранения")
            return
        
        df = pd.DataFrame(data)
        df.to_csv(filename, index=False, encoding='utf-8-sig')
        print(f"CSV файл создан: {filename}")
        print(f"Количество записей: {len(data)}")
        
        if data:
            print("Структура данных:")
            print(f"Колонки: {list(df.columns)}")
            
            if 'price' in df.columns or 'average_price' in df.columns:
                price_col = 'price' if 'price' in df.columns else 'average_price'
                if not df[price_col].isna().all():
                    prices = df[price_col].dropna()
                    print(f"Диапазон цен: {prices.min()} - {prices.max()} RUB")

    def save_to_json(self, data: Dict, filename: str):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"JSON файл создан: {filename}")

    def test_api_connection(self):
        print("Тестирование подключения к API...")
        
        endpoints = [
            ("/queries/GetContracts", "Контракты"),
            ("/queries/GetSkus", "Товары"),
            ("/queries/GetSuppliers", "Поставщики"),
            ("/references/GetProductionDirectoryReference", "Категории")
        ]
        
        for endpoint, description in endpoints:
            url = f"{self.base_url}{endpoint}"
            print(f"Тестирование: {description}")
            
            try:
                response = self.session.post(url, json={"take": 1})
                print(f"Статус: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    count = data.get('count', len(data.get('items', [])))
                    print(f"Доступно записей: {count}")
                else:
                    print(f"Ошибка: {response.text[:100]}")
                    
            except Exception as e:
                print(f"Ошибка подключения: {e}")
            
            print("-" * 40)

    def collect_comprehensive_data(self):
        print("Сбор комплексных данных с портала закупок...")
        print("=" * 60)
        
        self.test_api_connection()
        
        print("Сбор данных о контрактах...")
        contracts_data = self.get_contracts(take=100)
        if contracts_data:
            parsed_contracts = self.parse_contracts_data(contracts_data)
            self.save_to_csv(parsed_contracts, "contracts_data.csv")
            self.save_to_json(contracts_data, "contracts_full.json")
        
        print("Сбор данных о товарах...")
        skus_data = self.get_skus(take=100)
        if skus_data:
            parsed_skus = self.parse_skus_data(skus_data)
            self.save_to_csv(parsed_skus, "skus_data.csv")
            self.save_to_json(skus_data, "skus_full.json")
        
        print("Сбор данных о поставщиках...")
        suppliers_data = self.get_suppliers(take=50)
        if suppliers_data:
            self.save_to_json(suppliers_data, "suppliers_data.json")
        
        print("Сбор данных о категориях...")
        categories_data = self.get_categories()
        if categories_data:
            self.save_to_json(categories_data, "categories_data.json")
        
        print("Сбор данных завершен")

def main():
    api_client = MosZakupkiOfficialAPI()
    api_client.collect_comprehensive_data()

if __name__ == "__main__":
    main()