/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
// components/FavoritesTab.jsx
import { useState, useEffect } from 'react';
import { favoritesAPI } from '../services/api';
import './FavoritesTab.css';

function FavoritesTab({ user }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'products', 'procurements'

  useEffect(() => {
    loadFavorites();
  }, [activeFilter]);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const type = activeFilter === 'all' ? null : activeFilter;
      const response = await favoritesAPI.getFavorites(type);
      setFavorites(response.favorites || []);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFavorite = async (favoriteId) => {
    try {
      await favoritesAPI.removeFavorite(favoriteId);
      setFavorites(prev => prev.filter(fav => fav.id !== favoriteId));
    } catch (error) {
      console.error('Error removing favorite:', error);
      alert('Ошибка при удалении из избранного');
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  if (loading) {
    return <div className="loading">Загрузка избранного...</div>;
  }

  return (
    <div className="favorites-tab">
      <div className="filters-header">
        <h3>Моё избранное</h3>
        <div className="favorite-filters">
          <button 
            className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Все ({favorites.length})
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'products' ? 'active' : ''}`}
            onClick={() => setActiveFilter('products')}
          >
            Товары ({favorites.filter(f => f.type === 'product').length})
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'procurements' ? 'active' : ''}`}
            onClick={() => setActiveFilter('procurements')}
          >
            Закупки ({favorites.filter(f => f.type === 'procurement').length})
          </button>
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">❤️</div>
          <h4>В избранном пока ничего нет</h4>
          <p>Добавляйте товары и закупки в избранное, чтобы не потерять</p>
        </div>
      ) : (
        <div className="favorites-grid">
          {favorites.map(favorite => (
            <div key={favorite.id} className="favorite-item card">
              {favorite.type === 'product' ? (
                <div className="favorite-product">
                  <div className="product-header">
                    <h4>{favorite.product.name}</h4>
                    <button 
                      className="remove-favorite-btn"
                      onClick={() => handleRemoveFavorite(favorite.id)}
                      title="Удалить из избранного"
                    >
                      ❌
                    </button>
                  </div>
                  <div className="product-details">
                    <p><strong>Категория:</strong> {favorite.product.category_name}</p>
                    <p><strong>Производитель:</strong> {favorite.product.company}</p>
                    <p><strong>Цена:</strong> {formatPrice(favorite.product.price_per_item)} ₽</p>
                  </div>
                  <div className="product-actions">
                    <button className="btn-primary">В закупку</button>
                    <button className="btn-outline">Подробнее</button>
                  </div>
                </div>
              ) : (
                <div className="favorite-procurement">
                  <div className="procurement-header">
                    <h4>{favorite.procurement.title}</h4>
                    <button 
                      className="remove-favorite-btn"
                      onClick={() => handleRemoveFavorite(favorite.id)}
                      title="Удалить из избранного"
                    >
                      ❌
                    </button>
                  </div>
                  <div className="procurement-details">
                    <p><strong>Заказчик:</strong> {favorite.procurement.customer_name}</p>
                    <p><strong>Цена:</strong> {formatPrice(favorite.procurement.current_price)} ₽</p>
                    <p><strong>Статус:</strong> {favorite.procurement.status}</p>
                  </div>
                  <div className="procurement-actions">
                    <button className="btn-primary">Участвовать</button>
                    <button className="btn-outline">Подробнее</button>
                  </div>
                </div>
              )}
              <div className="favorite-meta">
                Добавлено: {new Date(favorite.created_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FavoritesTab;