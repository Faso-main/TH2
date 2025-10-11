// recommendation_routes.js
const express = require('express');
const router = express.Router();
const recommendationController = require('./recommendation_controller');
const { checkSession } = require('./auth_middleware');

router.post('/recommendations', checkSession, (req, res) => {
    recommendationController.getRecommendations(req, res);
});

module.exports = router;