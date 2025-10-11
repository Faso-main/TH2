// recommendation_controller.js
const axios = require('axios');

class RecommendationController {
    constructor() {
        this.pythonServiceUrl = 'http://localhost:8000';
    }

    async getRecommendations(req, res) {
        try {
            const { user_id, limit = 15 } = req.body;
            
            // Вызов Python-сервиса
            const response = await axios.post(
                `${this.pythonServiceUrl}/api/recommendations`,
                { user_id, limit },
                { timeout: 10000 } // 10 секунд таймаут
            );

            res.json(response.data);
        } catch (error) {
            console.error('Recommendation error:', error.message);
            
            // Fallback - популярные товары из БД
            const fallbackRecommendations = await this.getFallbackRecommendations();
            res.json({
                user_id: req.body.user_id,
                recommendations: fallbackRecommendations,
                count: fallbackRecommendations.length,
                note: 'fallback_recommendations'
            });
        }
    }

    async getFallbackRecommendations(limit = 15) {
        // Простые рекомендации из БД если Python-сервис недоступен
        const result = await pool.query(`
            SELECT 
                p.product_id as id,
                p.name,
                p.average_price as price_per_item,
                p.manufacturer as company,
                c.name as category_name,
                COUNT(pi.procurement_item_id) as purchase_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN procurement_items pi ON p.product_id = pi.product_id
            WHERE p.is_available = true
            GROUP BY p.product_id, p.name, p.average_price, p.manufacturer, c.name
            ORDER BY purchase_count DESC, p.average_price DESC
            LIMIT $1
        `, [limit]);

        return result.rows;
    }
}

module.exports = new RecommendationController();