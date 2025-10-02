import requests
import base64

class MosZakupkiAuth:
    def __init__(self):
        self.base_url = "https://api.zakupki.mos.ru/api/v1"
        self.session = requests.Session()
        
    def try_api_key_auth(self):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': 'YESYESYES',
        }
        
        self.session.headers.update(headers)
        
        # Тестовый запрос
        response = self.session.post(f"{self.base_url}/queries/GetSkus", json={"take": 1})
        return response.status_code