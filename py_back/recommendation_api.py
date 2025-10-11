from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel
from recommendation_service import PGRecommendationService
import asyncio

app = FastAPI(title="Procurement Recommendation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = PGRecommendationService()

class RecommendationRequest(BaseModel):
    user_id: str
    limit: int = 15

@app.on_event("startup")
async def startup_event():
    await service.init_recommender()
    print("✅ Recommendation service initialized")

@app.post("/api/recommendations")
async def get_recommendations(request: RecommendationRequest):
    try:
        print(f"🎯 Getting recommendations for user: {request.user_id}")
        recommendations = await service.get_user_recommendations(
            request.user_id, 
            request.limit
        )
        return {
            "user_id": request.user_id,
            "recommendations": recommendations,
            "count": len(recommendations)
        }
    except Exception as e:
        print(f"❌ Recommendation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "recommendation_api"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)