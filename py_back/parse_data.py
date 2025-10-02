import requests
import json

def quick_api_test():
    url = "https://api.zakupki.mos.ru/api/v1/queries/GetSkus"
    
    params = {
        "take": 10,
        "skip": 0,
        "withCount": True,
        "filter": {
            "hasOffers": True
        }
    }
    
    try:
        print("Тестируем API v1...")
        response = requests.post(url, json=params, timeout=10)
        print(f"Статус: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Найдено товаров: {data.get('totalCount', 0)}")
            
            if data.get('items'):
                first_item = data['items'][0]
                print(f"\nПервый товар:")
                print(f"  ID: {first_item.get('id')}")
                print(f"  Название: {first_item.get('name')}")
                print(f"  Бренд: {first_item.get('brand')}")
                print(f"  Цена: {first_item.get('averagePrice')}")
                print(f"  Валюта: {first_item.get('currency')}")
                
                # Сохраняем структуру для анализа
                with open("result.json", "w", encoding="utf-8") as f:
                    json.dump(first_item, f, ensure_ascii=False, indent=2)
                print("Пример ответа сохранен в result.json")
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")

# Запускаем быстрый тест
quick_api_test()