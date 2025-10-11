// controllers/recommendation_controller.js
const axios = require('axios');

class RecommendationController {
    constructor() {
        this.pythonServiceUrl = 'http://127.0.0.1:8000';
        this.timeout = 10000;
    }

    async getRecommendations(req, res) {
        try {
            const { user_id, limit = 15 } = req.body;
            
            console.log(`🎯 Getting ML recommendations for user: ${user_id}`);
            
            const response = await axios.post(
                `${this.pythonServiceUrl}/api/recommendations`,
                { 
                    user_id: user_id,
                    limit: parseInt(limit)
                },
                { 
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`✅ Successfully received ${response.data.recommendations?.length || 0} recommendations`);
            
            res.json({
                success: true,
                ...response.data
            });

        } catch (error) {
            console.error('❌ ML Recommendation error:', error.message);
            
            // Fallback - базовые рекомендации
            try {
                const fallbackRecommendations = await this.getFallbackRecommendations(limit);
                
                res.json({
                    success: false,
                    user_id: req.body.user_id,
                    recommendations: fallbackRecommendations,
                    count: fallbackRecommendations.length,
                    note: 'fallback_recommendations',
                    error: error.message
                });
                
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError);
                res.status(500).json({
                    success: false,
                    error: 'Рекомендации временно недоступны',
                    details: error.message
                });
            }
        }
    }

    async getFallbackRecommendations(limit = 15) {
        // Простые рекомендации без БД
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
                explanation: "Базовая рекомендация",
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

module.exports = new RecommendationController();