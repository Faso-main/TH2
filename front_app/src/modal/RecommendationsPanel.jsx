import { useState, useEffect } from 'react';
import { unifiedAPI } from '../services/api';
import { generateProductImage, getCategoryColor } from '../utils/productImages';
import './RecommendationsPanel.css';


function RecommendationsPanel({ currentUser, onAddToProcurement }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

const loadRecommendations = async () => {
  if (!currentUser) return;
  
  setLoading(true);
  setError(null);
  
  try {
    const result = await unifiedAPI.recommendations.getQuickRecommendations(6);
    
    // ✅ ПРАВИЛЬНАЯ ОБРАБОТКА
    if (result.recommendations && result.recommendations.length > 0) {
      setRecommendations(result.recommendations);
      if (!result.success) {
        setError('Используются базовые рекомендации');
      }
    } else {
      setRecommendations([]);
      setError('Нет доступных рекомендаций');
    }
  } catch (err) {
    setError('Не удалось загрузить рекомендации');
    setRecommendations([]); // очищаем при ошибке
    console.error('Recommendations error:', err);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    if (currentUser) {
      loadRecommendations();
    }
  }, [currentUser]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  if (!currentUser) {
    return (
      <div className="recommendations-panel">
        <h3>Персональные рекомендации</h3>
        <div className="auth-required">
          <p>Войдите в систему для получения персональных рекомендаций</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recommendations-panel">
      <div className="recommendations-header">
        <h3>Персональные рекомендации</h3>
        <button 
          className="refresh-btn"
          onClick={loadRecommendations}
          disabled={loading}
        >
          {loading ? '🔄' : '🔄'}
        </button>
      </div>

      {error && (
        <div className="recommendations-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="recommendations-loading">
          <div className="loading-spinner"></div>
          <p>Ищем лучшие предложения для вас...</p>
        </div>
      ) : recommendations.length > 0 ? (
        <div className="recommendations-grid">
          {recommendations.map((product, index) => {
            const categoryColor = getCategoryColor(product.category_name);
            const imageUrl = generateProductImage(product.name, categoryColor);
            
            return (
              <div key={product.id || index} className="recommendation-card">
                <div className="recommendation-image">
                  <img 
                    src={imageUrl}
                    alt={product.name}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                  <div className="recommendation-image-fallback">
                    {product.name}
                  </div>
                  {product.total_score > 0.7 && (
                    <div className="recommendation-badge">🔥</div>
                  )}
                </div>
                
                <div className="recommendation-info">
                  <h4 className="recommendation-title">{product.name}</h4>
                  <p className="recommendation-category">{product.category_name}</p>
                  <p className="recommendation-score">
                    Совпадение: {(product.total_score * 100).toFixed(0)}%
                  </p>
                  <div className="recommendation-price">
                    {formatPrice(product.price_per_item)} ₽
                  </div>
                  {product.explanation && (
                    <p className="recommendation-explanation">
                      {product.explanation}
                    </p>
                  )}
                  <button 
                    className="add-recommendation-btn"
                    onClick={() => onAddToProcurement(product)}
                  >
                    ➕ В закупку
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="no-recommendations">
          <p>Пока нет рекомендаций. Совершите несколько покупок для персонализации.</p>
        </div>
      )}
    </div>
  );
}

export default RecommendationsPanel;