// routes/recommendation_routes.js
const express = require('express');
const router = express.Router();
const recommendationController = require('./recommendation_controller');

// Получить рекомендации для пользователя
router.post('/recommendations', (req, res) => {
    recommendationController.getRecommendations(req, res);
});

// Проверить статус Python-сервиса  
router.get('/health', (req, res) => {
    recommendationController.healthCheck(req, res);
});

module.exports = router;