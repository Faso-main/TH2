import requests
import json
import jwt
from datetime import datetime

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

class MosZakupkiIntegrationTester:
    
    def __init__(self, api_key: str):
        self.base_url = "https://api.zakupki.mos.ru/api/v1"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        })

    def test_all_endpoints(self):
        """Тестируем все возможные endpoints"""
        print("\n" + "=" * 60)
        print("ТЕСТИРОВАНИЕ ENDPOINTS")
        print("=" * 60)
        
        endpoints_to_test = [
            # Основные queries
            ("/queries/GetSkus", "Товары (СТЕ)", {"take": 5}),
            ("/queries/GetContracts", "Контракты", {"take": 5}),
            ("/queries/GetSuppliers", "Поставщики", {"take": 5}),
            ("/queries/GetTenders", "Закупки", {"take": 5}),
            ("/queries/GetOffers", "Оферты", {"take": 5}),
            ("/queries/GetStatistics", "Статистика", {}),
            ("/queries/GetContractStats", "Статистика контрактов", {}),
            
            # References (справочники - обычно публичные)
            ("/references/GetOkpdReference", "Справочник ОКПД2", {}),
            ("/references/GetRegionsReference", "Справочник регионов", {}),
            ("/references/GetProductionDirectoryReference", "Категории товаров", {}),
            ("/references/GetProductionReference", "Справочник продукции", {}),
            
            # External queries (внешние запросы)
            ("/queries/GetExternalSkus", "Внешние СТЕ", {"take": 5}),
            ("/queries/GetExternalSkuChangeRequests", "Заявки на СТЕ", {"take": 5}),
            
            # Команды
            ("/commands/SyncWithEis", "Синхронизация с ЕИС", {}),
            ("/commands/ProcessIntegrationQueue", "Очередь интеграции", {}),
        ]
        
        available_endpoints = []
        
        for endpoint, description, params in endpoints_to_test:
            url = f"{self.base_url}{endpoint}"
            print(f"\n🔍 Тест: {description}")
            print(f"   URL: {endpoint}")
            
            try:
                response = self.session.post(url, json=params, timeout=10)
                print(f"   Статус: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    count = data.get('count', len(data.get('items', [])))
                    print(f"   ✅ ДОСТУПЕН - записей: {count}")
                    available_endpoints.append((endpoint, description, count))
                    
                    # Сохраняем пример данных
                    filename = f"available_{description.replace(' ', '_').lower()}.json"
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"   💾 Данные сохранены в {filename}")
                    
                elif response.status_code == 400:
                    print(f"   ⚠️  Требуются корректные параметры")
                    available_endpoints.append((endpoint, description, "needs_params"))
                    
                elif response.status_code == 403:
                    print(f"   ❌ ДОСТУП ЗАПРЕЩЕН")
                    
                elif response.status_code == 404:
                    print(f"   ❌ ENDPOINT НЕ НАЙДЕН")
                    
                elif response.status_code == 401:
                    print(f"   ❌ НЕАВТОРИЗОВАН")
                    
            except requests.exceptions.Timeout:
                print(f"   ⏰ ТАЙМАУТ")
            except Exception as e:
                print(f"   ❌ Ошибка: {e}")
        
        return available_endpoints

    def get_available_data(self, available_endpoints):
        """Получение данных с доступных endpoints"""
        print("\n" + "=" * 60)
        print("ПОЛУЧЕНИЕ ДАННЫХ С ДОСТУПНЫХ ENDPOINTS")
        print("=" * 60)
        
        for endpoint, description, count in available_endpoints:
            if count == "needs_params":
                continue
                
            print(f"\n📥 Получение данных: {description}")
            url = f"{self.base_url}{endpoint}"
            
            try:
                # Получаем больше данных для доступных endpoints
                params = {"take": 100, "skip": 0, "withCount": True}
                response = self.session.post(url, json=params, timeout=15)
                
                if response.status_code == 200:
                    data = response.json()
                    total_count = data.get('count', 0)
                    items_count = len(data.get('items', []))
                    
                    print(f"   ✅ Получено: {items_count} из {total_count} записей")
                    
                    # Сохраняем в CSV если есть данные
                    if data.get('items'):
                        self.save_to_csv(data['items'], description)
                        
            except Exception as e:
                print(f"   ❌ Ошибка: {e}")

    def save_to_csv(self, data, description):
        """Сохранение данных в CSV"""
        try:
            if data and isinstance(data[0], dict):
                df = pd.DataFrame(data)
                filename = f"{description.replace(' ', '_').lower()}.csv"
                df.to_csv(filename, index=False, encoding='utf-8-sig')
                print(f"   💾 CSV сохранен: {filename}")
                print(f"   📊 Колонки: {list(df.columns)[:5]}...")
        except Exception as e:
            print(f"   ❌ Ошибка сохранения CSV: {e}")

def main():
    # Ваш токен
    API_KEY = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJwbDgxLVYyWUNyQ1V0bmVRTWxxRUNmSVluS1Z3VExnQVIwZXhiTkF1SF9nIn0.eyJleHAiOjIwNzQ4MzM1MTcsImlhdCI6MTc1OTQ3NTIyMCwiYXV0aF90aW1lIjoxNzU5NDczNTE3LCJqdGkiOiIyNThmYTAzZi1jNTk5LTQ5MTUtOWUzYS0yMDdhMmYxOWVmNjYiLCJpc3MiOiJodHRwczovL3pha3Vwa2kubW9zLnJ1L2F1dGgvcmVhbG1zL1BwUmVhbG0iLCJhdWQiOiJJbnRlZ3JhdGlvbkFwcCIsInN1YiI6IjdlMjhiZTU5LWYyNjYtNGNkZi05OWJhLTMzYzJmYTFmZWY4ZSIsInR5cCI6IkJlYXJlciIsImF6cCI6IlBwQXBwIiwic2Vzc2lvbl9zdGF0ZSI6IjNkOTc1N2FhLTNlNjEtNGY5Ni1hNGIzLWE4NjMxNTk3YjVkMiIsInNjb3BlIjoiSW50ZWdyYXRpb25TY29wZSIsInNpZCI6IjNkOTc1N2FhLTNlNjEtNGY5Ni1hNGIzLWE4NjMxNTk3YjVkMiJ9.CREupv9Bav92I17mb62RwVqYIWH2kwaHGL4W9kNDXmvKSvK2jSio1skOGe_UjsmIzTrusEU4h8L9XuPZB-ILBDe3GANNsT4fF5WUWjHWjpeULpSa5Z7SijcPAQ-0S1tX734ysPwfT4N4_bsOzew-h7eMYaxTfH5PvXvI8ht73UCC0m8yKL_pufHt1y7HvjZ6ZpuW4AnyBnQdcmULMS9ufzU6KnH7QkDSiAUF-Xajpe-N2AyWBwdunmMtQ9sSGPPExYVzmqHzKWGdrQuqRmymAyvRfs9Cx12Sf7jpD4-aOwwu7gKfMaE6-2GypETFglGXPr3Y6EEUMpxyTbWljFP-rg"
    
    # Проверяем токен
    if not check_token_details(API_KEY):
        return
    
    # Тестируем endpoints
    tester = MosZakupkiIntegrationTester(API_KEY)
    available_endpoints = tester.test_all_endpoints()
    
    # Выводим результаты
    print("\n" + "=" * 60)
    print("ИТОГИ ТЕСТИРОВАНИЯ")
    print("=" * 60)
    
    if available_endpoints:
        print(f"✅ ДОСТУПНЫХ ENDPOINTS: {len(available_endpoints)}")
        for endpoint, description, count in available_endpoints:
            print(f"   📍 {description}: {endpoint} ({count})")
        
        # Получаем данные с доступных endpoints
        tester.get_available_data(available_endpoints)
    else:
        print("❌ Нет доступных endpoints")
        print("\nРЕКОМЕНДАЦИИ:")
        print("1. Обратитесь к администратору для получения прав")
        print("2. Запросите токен с scope 'read' или 'public'")
        print("3. Используйте веб-интерфейс портала")

if __name__ == "__main__":
    main()