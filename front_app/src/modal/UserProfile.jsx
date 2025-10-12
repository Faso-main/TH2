/* eslint-disable no-unused-vars */
// modal/UserProfile.jsx
import { useState, useEffect } from 'react';
import { userAPI, draftsAPI, favoritesAPI } from '../services/api';
import './UserProfile.css';

function UserProfile({ user, onClose, onCreateProcurement, onProcurementCreated }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    inn: '',
    company_name: '',
    phone_number: '',
    location: '',
    ...user
  });
  
  const [myProcurements, setMyProcurements] = useState([]);
  const [myParticipations, setMyParticipations] = useState([]);
  const [myDrafts, setMyDrafts] = useState([]);
  const [myFavorites, setMyFavorites] = useState([]); // Новое состояние для избранного
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData(prev => ({
        ...prev,
        ...user
      }));
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'my-procurements') {
      loadMyProcurements();
    } else if (activeTab === 'participations') {
      loadMyParticipations();
    } else if (activeTab === 'drafts') {
      loadMyDrafts();
    } else if (activeTab === 'favorites') { // Новый обработчик для избранного
      loadMyFavorites();
    }
  }, [activeTab]);

  const loadMyProcurements = async () => {
    try {
      setLoading(true);
      try {
        const data = await userAPI.getMyProcurements();
        setMyProcurements(data.procurements || []);
      } catch (error) {
        console.warn('API недоступно, используем тестовые данные');
        setMyProcurements([]);
      }
    } catch (error) {
      console.error('Error loading procurements:', error);
      setMyProcurements([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyParticipations = async () => {
    try {
      setLoading(true);
      try {
        const data = await userAPI.getMyParticipations();
        setMyParticipations(data.participations || []);
      } catch (error) {
        console.warn('API недоступно, используем тестовые данных');
        setMyParticipations([]);
      }
    } catch (error) {
      console.error('Error loading participations:', error);
      setMyParticipations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyDrafts = async () => {
    try {
      setLoading(true);
      try {
        const data = await draftsAPI.getMyDrafts();
        setMyDrafts(data.drafts || []);
      } catch (error) {
        console.warn('API черновиков недоступно, используем тестовые данные');
        setMyDrafts([
          {
            id: 'draft-1',
            title: 'Закупка офисной техники',
            customer_name: 'ООО "ТехноПарк"',
            current_price: 150000,
            created_at: '2024-01-15T10:30:00Z',
            step: 2,
            products_count: 5
          },
          {
            id: 'draft-2', 
            title: 'Канцелярские товары для офиса',
            customer_name: 'ИП Иванов',
            current_price: 45000,
            created_at: '2024-01-10T14:20:00Z',
            step: 1,
            products_count: 0
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
      setMyDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  // Новая функция для загрузки избранного
  const loadMyFavorites = async () => {
    try {
      setLoading(true);
      try {
        const data = await favoritesAPI.getFavorites();
        setMyFavorites(data.favorites || []);
      } catch (error) {
        console.warn('API избранного недоступно, используем тестовые данные');
        setMyFavorites([
          {
            id: 'fav-1',
            type: 'product',
            product: {
              id: 'prod-1',
              name: 'Смартфон Apple iPhone 15 Pro',
              category_name: 'Электроника',
              price_per_item: 89999,
              company: 'Apple'
            },
            created_at: '2024-01-15T10:30:00Z'
          },
          {
            id: 'fav-2',
            type: 'procurement', 
            procurement: {
              id: 'PROC-12345',
              title: 'Оказание услуг по проведению специальной оценки условий труда',
              current_price: 92500,
              status: 'active',
              customer_name: '«Школа № 1811 «Восточное Измайлово»'
            },
            created_at: '2024-01-10T14:20:00Z'
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
      setMyFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      setSaveLoading(true);
      
      const updateData = {
        name: profileData.name,
        email: profileData.email,
        company_name: profileData.company_name,
        phone_number: profileData.phone_number,
        location: profileData.location
      };
      
      await userAPI.updateProfile(updateData);
      alert('Профиль успешно обновлен!');
    } catch (error) {
      alert('Ошибка при обновлении профиля: ' + error.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'INN') return;
    
    setProfileData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatINN = (inn) => {
    if (!inn) return '';
    return inn.toString().replace(/(\d{2})(\d{2})(\d{3})(\d{3})(\d{2})?/, '$1 $2 $3 $4 $5').trim();
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Активна';
      case 'draft': return 'Черновик';
      case 'completed': return 'Завершена';
      case 'pending': return 'На рассмотрении';
      case 'approved': return 'Одобрено';
      case 'rejected': return 'Отклонено';
      default: return status;
    }
  };

  const handleContinueDraft = (draft) => {
    onClose();
    console.log('Продолжение черновика:', draft);
    alert(`Продолжение работы с черновиком: "${draft.title}"`);
  };

  const handleDeleteDraft = async (draftId) => {
    if (window.confirm('Вы уверены, что хотите удалить этот черновик?')) {
      try {
        await draftsAPI.deleteDraft(draftId);
        setMyDrafts(prev => prev.filter(draft => draft.id !== draftId));
        alert('Черновик успешно удален');
      } catch (error) {
        alert('Ошибка при удалении черновика: ' + error.message);
      }
    }
  };

  // Новая функция для удаления из избранного
  const handleRemoveFavorite = async (favoriteId) => {
    if (window.confirm('Удалить из избранного?')) {
      try {
        await favoritesAPI.removeFavorite(favoriteId);
        setMyFavorites(prev => prev.filter(fav => fav.id !== favoriteId));
      } catch (error) {
        alert('Ошибка при удалении из избранного: ' + error.message);
      }
    }
  };

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="user-welcome">
          <div className="user-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <h3>{user?.name || 'Пользователь'}</h3>
            <p>{user?.email || 'Email не указан'}</p>
            {user?.company_name && <p>Компания: {user.company_name}</p>}
            {user?.INN && <p className="inn-display">ИНН: {formatINN(user.INN)}</p>}
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Профиль
        </button>
        <button 
          className={`tab-btn ${activeTab === 'my-procurements' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-procurements')}
        >
          Мои закупки
        </button>
        <button 
          className={`tab-btn ${activeTab === 'drafts' ? 'active' : ''}`}
          onClick={() => setActiveTab('drafts')}
        >
          Мои черновики
        </button>
        <button 
          className={`tab-btn ${activeTab === 'participations' ? 'active' : ''}`}
          onClick={() => setActiveTab('participations')}
        >
          Мои участия
        </button>
        {/* НОВАЯ ВКЛАДКА - ИЗБРАННОЕ */}
        <button 
          className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          Избранное
        </button>
      </div>

      <div className="profile-content">
        {activeTab === 'profile' && (
          <form className="profile-form" onSubmit={handleProfileUpdate}>
            <div className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Имя *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={profileData.name || ''}
                    onChange={handleInputChange}
                    required
                    placeholder="Введите ваше имя"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={profileData.email || ''}
                    onChange={handleInputChange}
                    required
                    placeholder="Введите ваш email"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="INN">ИНН</label>
                  <input
                    type="text"
                    id="INN"
                    name="INN"
                    value={formatINN(profileData.inn)}
                    onChange={handleInputChange}
                    disabled
                    placeholder="ИНН загружается..."
                    title="ИНН нельзя изменить после регистрации"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone_number">Телефон</label>
                  <input
                    type="tel"
                    id="phone_number"
                    name="phone_number"
                    value={profileData.phone_number || ''}
                    onChange={handleInputChange}
                    placeholder="+7 (999) 999-99-99"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="company_name">Название компании</label>
                <input
                  type="text"
                  id="company_name"
                  name="company_name"
                  value={profileData.company_name || ''}
                  onChange={handleInputChange}
                  placeholder="Введите название вашей компании"
                />
              </div>

              <div className="form-group">
                <label htmlFor="location">Адрес</label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={profileData.location || ''}
                  onChange={handleInputChange}
                  placeholder="Город, улица, дом"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-primary btn-full"
              disabled={saveLoading}
            >
              {saveLoading ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </form>
        )}

        {activeTab === 'my-procurements' && (
          <div className="procurements-list">
            <div className="section-header">
              <h3>Мои созданные закупки</h3>
            </div>
            
            {loading ? (
              <div className="loading">Загрузка...</div>
            ) : myProcurements.length > 0 ? (
              <div className="items-grid">
                {myProcurements.map(procurement => (
                  <div key={procurement.id} className="procurement-item card">
                    <div className="procurement-header">
                      <h4>{procurement.title}</h4>
                      <span className={`status-badge status-${procurement.status}`}>
                        {getStatusText(procurement.status)}
                      </span>
                    </div>
                    <div className="procurement-details">
                      <p><strong>Котировочная сессия:</strong> {procurement.session_number}</p>
                      <p><strong>Начальная цена:</strong> {formatPrice(procurement.current_price)} ₽</p>
                      <p><strong>Участников:</strong> {procurement.participants_count || 0}</p>
                      <p><strong>Заказчик:</strong> {procurement.customer_name}</p>
                      <p><strong>Создана:</strong> {formatDate(procurement.created_at)}</p>
                    </div>
                    <div className="procurement-actions">
                      <button className="btn-outline">Просмотреть</button>
                      {procurement.status === 'draft' && (
                        <button className="btn-primary">Редактировать</button>
                      )}
                      {procurement.status === 'active' && (
                        <button className="btn-primary">Управление</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h4>Закупок пока нет</h4>
                <p>Создайте свою первую закупку и начните привлекать поставщиков</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'drafts' && (
          <div className="drafts-list">
            <div className="section-header">
              <h3>Мои черновики закупок</h3>
            </div>
            
            {loading ? (
              <div className="loading">Загрузка...</div>
            ) : myDrafts.length > 0 ? (
              <div className="items-grid">
                {myDrafts.map(draft => (
                  <div key={draft.id} className="draft-item card">
                    <div className="procurement-header">
                      <h4>{draft.title}</h4>
                      <span className="status-badge status-draft">
                        Черновик
                      </span>
                    </div>
                    <div className="procurement-details">
                      <p><strong>Заказчик:</strong> {draft.customer_name}</p>
                      <p><strong>Примерная стоимость:</strong> {formatPrice(draft.current_price)} ₽</p>
                      <p><strong>Товаров:</strong> {draft.products_count || 0}</p>
                      <p><strong>Прогресс:</strong> Шаг {draft.step} из 3</p>
                      <p><strong>Создан:</strong> {formatDate(draft.created_at)}</p>
                      <p><strong>Обновлен:</strong> {formatDate(draft.updated_at)}</p>
                    </div>
                    <div className="procurement-actions">
                      <button 
                        className="btn-primary"
                        onClick={() => handleContinueDraft(draft)}
                      >
                        Продолжить
                      </button>
                      <button 
                        className="btn-outline"
                        onClick={() => handleDeleteDraft(draft.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <h4>Черновиков пока нет</h4>
                <p>Начните создавать закупку и сохраняйте прогресс в черновиках</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'participations' && (
          <div className="participations-list">
            <h3>Мои участия в закупках</h3>
            {loading ? (
              <div className="loading">Загрузка...</div>
            ) : myParticipations.length > 0 ? (
              <div className="items-grid">
                {myParticipations.map(participation => (
                  <div key={participation.id} className="participation-item card">
                    <div className="participation-header">
                      <h4>{participation.procurement_title}</h4>
                      <span className={`status-badge status-${participation.status}`}>
                        {getStatusText(participation.status)}
                      </span>
                    </div>
                    <div className="participation-details">
                      <p><strong>Мое предложение:</strong> {formatPrice(participation.proposed_price)} ₽</p>
                      <p><strong>Заказчик:</strong> {participation.customer_name}</p>
                      <p><strong>Дата подачи:</strong> {formatDate(participation.created_at)}</p>
                      {participation.status === 'rejected' && participation.rejection_reason && (
                        <p><strong>Причина отказа:</strong> {participation.rejection_reason}</p>
                      )}
                    </div>
                    <div className="participation-actions">
                      <button className="btn-outline">Подробнее</button>
                      {participation.status === 'pending' && (
                        <button className="btn-outline">Отозвать</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🏆</div>
                <h4>Участий пока нет</h4>
                <p>Найдите интересные закупки и подайте заявку на участие!</p>
                <button className="btn-primary">Найти закупки</button>
              </div>
            )}
          </div>
        )}

        {/* НОВАЯ СЕКЦИЯ - ИЗБРАННОЕ */}
        {activeTab === 'favorites' && (
          <div className="favorites-list">
            <div className="section-header">
              <h3>Моё избранное</h3>
              <div className="favorite-filters">
                <button 
                  className={`filter-btn active`}
                  onClick={() => loadMyFavorites()}
                >
                  Все ({myFavorites.length})
                </button>
              </div>
            </div>
            
            {loading ? (
              <div className="loading">Загрузка избранного...</div>
            ) : myFavorites.length > 0 ? (
              <div className="items-grid">
                {myFavorites.map(favorite => (
                  <div key={favorite.id} className="favorite-item card">
                    {favorite.type === 'product' ? (
                      <div className="favorite-product">
                        <div className="procurement-header">
                          <h4>{favorite.product.name}</h4>
                          <button 
                            className="remove-favorite-btn"
                            onClick={() => handleRemoveFavorite(favorite.id)}
                            title="Удалить из избранного"
                          >
                            ❌
                          </button>
                        </div>
                        <div className="procurement-details">
                          <p><strong>Категория:</strong> {favorite.product.category_name}</p>
                          <p><strong>Производитель:</strong> {favorite.product.company}</p>
                          <p><strong>Цена:</strong> {formatPrice(favorite.product.price_per_item)} ₽</p>
                          <p><strong>Добавлено:</strong> {formatDate(favorite.created_at)}</p>
                        </div>
                        <div className="procurement-actions">
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
                          <p><strong>Статус:</strong> {getStatusText(favorite.procurement.status)}</p>
                          <p><strong>Добавлено:</strong> {formatDate(favorite.created_at)}</p>
                        </div>
                        <div className="procurement-actions">
                          <button className="btn-primary">Участвовать</button>
                          <button className="btn-outline">Подробнее</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">❤️</div>
                <h4>В избранном пока ничего нет</h4>
                <p>Добавляйте товары и закупки в избранное, чтобы не потерять</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;