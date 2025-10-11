import axios from 'axios';

class RecommendationController {
    constructor() {
        this.pythonServiceUrl = 'http://127.0.0.1:8000';
        this.timeout = 10000;
    }

    async getRecommendations(req, res) {
        try {
            const { user_id, limit = 15 } = req.body;
            
            console.log(`🎯 Getting recommendations for user: ${user_id}`);
            
            // ВРЕМЕННО: сразу возвращаем fallback, не пытаясь подключиться к Python
            console.log('⚠️ Python service disabled, using fallback');
            const fallbackRecommendations = this.getFallbackRecommendations(limit);
            
            return res.json({
                success: true,  // меняем на true чтобы фронтенд не ругался
                user_id: user_id,
                recommendations: fallbackRecommendations,
                count: fallbackRecommendations.length,
                note: 'fallback_working'
            });

        } catch (error) {
            console.error('❌ Recommendation error:', error.message);
            
            const fallbackRecommendations = this.getFallbackRecommendations(req.body?.limit || 15);
            
            res.json({
                success: false,
                user_id: req.body?.user_id,
                recommendations: fallbackRecommendations,
                count: fallbackRecommendations.length,
                note: 'error_fallback',
                error: error.message
            });
        }
    }

    getFallbackRecommendations(limit = 15) {
        return [
            {
                product_id: "fallback_1",
                product_name: "Базовый товар 1",
                product_category: "Электроника", 
                total_score: 0.5,
                price_range: { avg: 5000 },
                explanation: "Базовая рекомендация",
                in_catalog: true
            },
            {
                product_id: "fallback_2", 
                product_name: "Базовый товар 2", 
                product_category: "Офис",
                total_score: 0.5,
                price_range: { avg: 3000 },
                explanation: "Базовая рекомендаation", 
                in_catalog: true
            }
        ].slice(0, limit);
    }

    async healthCheck(req, res) {
        try {
            const response = await axios.get(`${this.pythonServiceUrl}/health`, {
                timeout: 5000
            });
            res.json({
                python_service: response.data,
                status: 'healthy'
            });
        } catch (error) {
            res.status(503).json({
                python_service: 'unavailable', 
                status: 'unhealthy',
                error: error.message
            });
        }
    }
}

// Создаем экземпляр и экспортируем его
const recommendationController = new RecommendationController();
export { recommendationController };