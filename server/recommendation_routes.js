import express from 'express';
import { recommendationController } from './recommendation_controller.js';

const router = express.Router();

// Получить рекомендации для пользователя
router.post('/recommendations', (req, res) => {
    recommendationController.getRecommendations(req, res);
});

// Проверить статус Python-сервиса  
router.get('/health', (req, res) => {
    recommendationController.healthCheck(req, res);
});

export default router;