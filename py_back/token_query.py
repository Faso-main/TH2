import requests
import json
import jwt
from datetime import datetime
import pandas as pd

def check_token_details(token: str):
    """Детальная проверка токена"""
    print("=" * 60)
    print("ДЕТАЛЬНЫЙ АНАЛИЗ ТОКЕНА")
    print("=" * 60)
    
    try:
        # Декодируем токен
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        print("📋 ИНФОРМАЦИЯ О ТОКЕНЕ:")
        print(f"👤 Субъект (sub): {decoded.get('sub')}")
        print(f"🎯 Клиент (azp): {decoded.get('azp')}")
        print(f"📊 Область (scope): {decoded.get('scope')}")
        print(f"🆔 ID сессии: {decoded.get('sid')}")
        print(f"⏰ Выдан: {datetime.fromtimestamp(decoded.get('auth_time', 0))}")
        print(f"📅 Создан: {datetime.fromtimestamp(decoded.get('iat', 0))}")
        print(f"⏰ Истекает: {datetime.fromtimestamp(decoded.get('exp', 0))}")
        
        # Проверяем срок действия
        exp_time = datetime.fromtimestamp(decoded.get('exp', 0))
        current_time = datetime.now()
        
        if exp_time > current_time:
            print("✅ Токен действителен")
            return True
        else:
            print("❌ Токен просрочен")
            return False
            
    except Exception as e:
        print(f"❌ Ошибка проверки токена: {e}")
        return False

class MosZakupkiAPITester:
    
    def __init__(self, api_key: str):
        self.base_url = "https://api.zakupki.mos.ru/api/v1"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        })

    def test_comprehensive_endpoints(self):
        """Комплексное тестирование всех возможных endpoints"""
        print("\n" + "=" * 60)
        print("КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ ENDPOINTS")
        print("=" * 60)
        
        endpoints_to_test = [
            # Основные queries - данные
            ("/queries/GetSkus", "Товары (СТЕ)", {"take": 5, "skip": 0}),
            ("/queries/GetContracts", "Контракты", {"take": 5, "skip": 0}),
            ("/queries/GetSuppliers", "Поставщики", {"take": 5, "skip": 0}),
            ("/queries/GetTenders", "Закупки", {"take": 5, "skip": 0}),
            ("/queries/GetOffers", "Оферты", {"take": 5, "skip": 0}),
            ("/queries/GetCustomers", "Заказчики", {"take": 5, "skip": 0}),
            
            # Статистика
            ("/queries/GetStatistics", "Статистика", {}),
            ("/queries/GetContractStats", "Статистика контрактов", {}),
            
            # Справочники
            ("/references/GetOkpdReference", "Справочник ОКПД2", {}),
            ("/references/GetRegionsReference", "Справочник регионов", {}),
            ("/references/GetProductionDirectoryReference", "Категории товаров", {}),
            ("/references/GetProductionReference", "Справочник продукции", {}),
            
            # Внешние запросы
            ("/queries/GetExternalSkus", "Внешние СТЕ", {"take": 5}),
            ("/queries/GetExternalSkuChangeRequests", "Заявки на СТЕ", {"take": 5}),
            
            # Команды интеграции
            ("/commands/SyncWithEis", "Синхронизация с ЕИС", {}),
            ("/commands/ProcessIntegrationQueue", "Очередь интеграции", {}),
            ("/commands/AddExternalIntegrationQueue", "Добавление в очередь", {}),
            
            # Внешние команды
            ("/externalCommands/ReceiveNotification", "Получение уведомлений", {}),
            ("/externalCommands/CreateNeed", "Создание потребности", {}),
            
            # Token endpoints
            ("/Token/CheckToken", "Проверка токена", {}),
            ("/Token/CreateToken", "Создание токена", {}),
        ]
        
        available_endpoints = []
        
        for endpoint, description, params in endpoints_to_test:
            url = f"{self.base_url}{endpoint}"
            print(f"\n🔍 Тест: {description}")
            print(f"   URL: {endpoint}")
            
            try:
                # Пробуем POST запрос
                response = self.session.post(url, json=params, timeout=10)
                print(f"   POST статус: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    count = data.get('count', len(data.get('items', [])))
                    print(f"   ✅ ДОСТУПЕН - записей: {count}")
                    available_endpoints.append((endpoint, description, count, 'POST'))
                    
                    # Сохраняем пример данных
                    filename = f"available_{description.replace(' ', '_').lower()}.json"
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"   💾 Данные сохранены в {filename}")
                    
                elif response.status_code == 400:
                    print(f"   ⚠️  Требуются корректные параметры")
                    available_endpoints.append((endpoint, description, "needs_params", 'POST'))
                    
                elif response.status_code == 403:
                    print(f"   ❌ ДОСТУП ЗАПРЕЩЕН")
                    
                elif response.status_code == 404:
                    print(f"   ❌ ENDPOINT НЕ НАЙДЕН")
                    
                elif response.status_code == 401:
                    print(f"   ❌ НЕАВТОРИЗОВАН")
                    
                elif response.status_code == 405:
                    # Пробуем GET если POST не поддерживается
                    print(f"   ⚠️  POST не поддерживается, пробуем GET...")
                    get_response = self.session.get(url, timeout=10)
                    print(f"   GET статус: {get_response.status_code}")
                    
                    if get_response.status_code == 200:
                        data = get_response.json()
                        count = len(data) if isinstance(data, list) else len(data.get('items', []))
                        print(f"   ✅ ДОСТУПЕН через GET - записей: {count}")
                        available_endpoints.append((endpoint, description, count, 'GET'))
                    
            except requests.exceptions.Timeout:
                print(f"   ⏰ ТАЙМАУТ")
            except Exception as e:
                print(f"   ❌ Ошибка: {e}")
        
        return available_endpoints

    def get_detailed_data(self, available_endpoints):
        """Получение детальных данных с доступных endpoints"""
        print("\n" + "=" * 60)
        print("ПОЛУЧЕНИЕ ДЕТАЛЬНЫХ ДАННЫХ")
        print("=" * 60)
        
        for endpoint, description, count, method in available_endpoints:
            if count == "needs_params":
                continue
                
            print(f"\n📥 Получение данных: {description}")
            url = f"{self.base_url}{endpoint}"
            
            try:
                # Получаем больше данных
                if method == 'POST':
                    params = {"take": 50, "skip": 0, "withCount": True}
                    response = self.session.post(url, json=params, timeout=15)
                else:
                    response = self.session.get(url, timeout=15)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if isinstance(data, dict):
                        total_count = data.get('count', 0)
                        items = data.get('items', [])
                    else:
                        items = data
                        total_count = len(items)
                    
                    print(f"   ✅ Получено: {len(items)} из {total_count} записей")
                    
                    # Сохраняем в CSV если есть данные
                    if items:
                        self.save_to_csv(items, description)
                        
                    # Анализируем структуру данных
                    if items and isinstance(items[0], dict):
                        print(f"   📊 Структура: {list(items[0].keys())[:5]}...")
                        
            except Exception as e:
                print(f"   ❌ Ошибка: {e}")

    def save_to_csv(self, data, description):
        """Сохранение данных в CSV"""
        try:
            if data and isinstance(data[0], dict):
                df = pd.DataFrame(data)
                filename = f"{description.replace(' ', '_').lower()}_detailed.csv"
                df.to_csv(filename, index=False, encoding='utf-8-sig')
                print(f"   💾 CSV сохранен: {filename}")
                
                # Показываем базовую статистику
                numeric_cols = df.select_dtypes(include=['number']).columns
                if len(numeric_cols) > 0:
                    print(f"   📈 Числовые колонки: {list(numeric_cols)}")
                    
        except Exception as e:
            print(f"   ❌ Ошибка сохранения CSV: {e}")

    def test_specific_filters(self):
        """Тестирование специфических фильтров для доступных endpoints"""
        print("\n" + "=" * 60)
        print("ТЕСТИРОВАНИЕ ФИЛЬТРОВ")
        print("=" * 60)
        
        filter_tests = [
            {
                "endpoint": "/queries/GetSkus",
                "description": "Товары с фильтрами",
                "filters": [
                    {"hasOffers": True},
                    {"offerType": "referencePrice"},
                    {"kpgzCode": {"values": ["01"]}}
                ]
            },
            {
                "endpoint": "/queries/GetContracts", 
                "description": "Контракты с фильтрами",
                "filters": [
                    {"status": "ACTIVE"},
                    {"conclusionDate": {"from": "2024-01-01", "to": "2024-12-31"}}
                ]
            }
        ]
        
        for test in filter_tests:
            url = f"{self.base_url}{test['endpoint']}"
            print(f"\n🔍 Тест фильтров: {test['description']}")
            
            for filter_obj in test['filters']:
                params = {
                    "take": 10,
                    "skip": 0, 
                    "withCount": True,
                    "filter": filter_obj
                }
                
                try:
                    response = self.session.post(url, json=params, timeout=10)
                    print(f"   Фильтр {filter_obj}: статус {response.status_code}")
                    
                    if response.status_code == 200:
                        data = response.json()
                        count = data.get('count', 0)
                        print(f"   ✅ Найдено: {count} записей")
                        
                except Exception as e:
                    print(f"   ❌ Ошибка: {e}")

def main():
    # Ваш новый токен
    API_KEY = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJwbDgxLVYyWUNyQ1V0bmVRTWxxRUNmSVluS1Z3VExnQVIwZXhiTkF1SF9nIn0.eyJleHAiOjIwNzUxMzc3NDcsImlhdCI6MTc1OTc3NzgxOCwiYXV0aF90aW1lIjoxNzU5Nzc3NzQ3LCJqdGkiOiJlZjYzNzcwYi03YjcyLTQ1M2UtYWFiMS0wZDYwMzY0YjBiNTQiLCJpc3MiOiJodHRwczovL3pha3Vwa2kubW9zLnJ1L2F1dGgvcmVhbG1zL1BwUmVhbG0iLCJhdWQiOiJJbnRlZ3JhdGlvbkFwcCIsInN1YiI6IjdlMjhiZTU5LWYyNjYtNGNkZi05OWJhLTMzYzJmYTFmZWY4ZSIsInR5cCI6IkJlYXJlciIsImF6cCI6IlBwQXBwIiwic2Vzc2lvbl9zdGF0ZSI6ImViMGNmYzIzLWJjYmQtNDg1NS05OWRlLTkyNmY1Y2VkNmEyZiIsInNjb3BlIjoiSW50ZWdyYXRpb25TY29wZSIsInNpZCI6ImViMGNmYzIzLWJjYmQtNDg1NS05OWRlLTkyNmY1Y2VkNmEyZiJ9.ZJT5EnlbNip9C3yp_nCOmUfXPETQACO3v-1_FUAFZSTrjlc6F8PBRPpRToerFT4EWD1yndB5mkeMQ4XeYSEhvJ4ysDO4UUWSNPtQKDgHuBR03NbGOROKomI1YQq4-hHS5r_-O5bAsHEqWuSQTpvTDGhnns51IsQwo9FI56y26DS73j4NXSWl5OF1riQ0djahXTsB-psWVzvIsJrhNuvNOuDHyDElpBOiMLas6tjMfCVmL9fxrS5h4I4gKPLHmFaamdcy8Nl054gi6q9jFAppyZSjxIJdu7f9QgZc2CjxYenp7eOqkQzL_ThAoMPfvwExvBgoGWHh3i6pPnubkVOwPw"
    
    # Проверяем токен
    if not check_token_details(API_KEY):
        return
    
    # Тестируем endpoints
    tester = MosZakupkiAPITester(API_KEY)
    available_endpoints = tester.test_comprehensive_endpoints()
    
    # Выводим результаты
    print("\n" + "=" * 60)
    print("ИТОГИ ТЕСТИРОВАНИЯ")
    print("=" * 60)
    
    if available_endpoints:
        print(f"✅ ДОСТУПНЫХ ENDPOINTS: {len(available_endpoints)}")
        for endpoint, description, count, method in available_endpoints:
            print(f"   📍 {description}: {endpoint} ({method}) - {count}")
        
        # Получаем детальные данные
        tester.get_detailed_data(available_endpoints)
        
        # Тестируем фильтры
        tester.test_specific_filters()
        
    else:
        print("❌ Нет доступных endpoints")
        print("\nРЕКОМЕНДАЦИИ:")
        print("1. IntegrationScope имеет ограниченные права")
        print("2. Запросите токен с scope 'read' или 'public'")
        print("3. Обратитесь к администратору портала")

if __name__ == "__main__":
    main()