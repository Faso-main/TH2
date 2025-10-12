/* eslint-disable no-unused-vars */
// modal/UserProfile.jsx
import { useState, useEffect } from 'react';
import { userAPI, draftsAPI, procurementsAPI } from '../services/api';
import './UserProfile.css';

// eslint-disable-next-line no-unused-vars
function UserProfile({ user, onClose }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [userProcurements, setUserProcurements] = useState([]);
  const [userParticipations, setUserParticipations] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [procurementsLoading, setProcurementsLoading] = useState(false);
  const [participationsLoading, setParticipationsLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    company_name: user?.company_name || '',
    phone_number: user?.phone_number || ''
  });

  // Загрузка данных при смене вкладки
  useEffect(() => {
    if (activeTab === 'procurements') {
      loadUserProcurements();
    } else if (activeTab === 'participations') {
      loadUserParticipations();
    } else if (activeTab === 'drafts') {
      loadDrafts();
    }
  }, [activeTab]);

  const loadUserProcurements = async () => {
    setProcurementsLoading(true);
    try {
      const response = await userAPI.getMyProcurements();
      setUserProcurements(response.procurements || []);
    } catch (error) {
      console.error('Error loading procurements:', error);
      setUserProcurements([]);
    } finally {
      setProcurementsLoading(false);
    }
  };

  const loadUserParticipations = async () => {
    setParticipationsLoading(true);
    try {
      const response = await userAPI.getMyParticipations();
      setUserParticipations(response.participations || []);
    } catch (error) {
      console.error('Error loading participations:', error);
      setUserParticipations([]);
    } finally {
      setParticipationsLoading(false);
    }
  };

  const loadDrafts = async () => {
    setDraftsLoading(true);
    try {
      const response = await draftsAPI.getMyDrafts();
      setDrafts(response.drafts || []);
    } catch (error) {
      console.error('Error loading drafts:', error);
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  };

  const handleEditToggle = () => {
    setEditing(!editing);
    if (editing) {
      // Сбрасываем форму при отмене редактирования
      setFormData({
        name: user?.name || '',
        email: user?.email || '',
        company_name: user?.company_name || '',
        phone_number: user?.phone_number || ''
      });
    }
  };

  const handleSaveProfile = async () => {
    try {
      const response = await userAPI.updateProfile(formData);
      setEditing(false);
      alert('Профиль успешно обновлен');
      // Обновляем данные пользователя в localStorage
      if (response.user) {
        localStorage.setItem('currentUser', JSON.stringify(response.user));
      }
    } catch (error) {
      alert('Ошибка при обновлении профиля: ' + error.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const handleContinueDraft = (draft) => {
    console.log('Continue draft:', draft);
    alert(`Функция продолжения редактирования черновика "${draft.title}" будет доступна в следующем обновлении`);
    // Здесь будет логика открытия модального окна создания закупки с данными черновика
  };

  const handleDeleteDraft = async (draftId, draftTitle) => {
    if (window.confirm(`Удалить черновик "${draftTitle}"?`)) {
      try {
        await draftsAPI.deleteDraft(draftId);
        loadDrafts(); // Перезагружаем список
        alert('Черновик удален');
      } catch (error) {
        alert('Ошибка при удалении черновика: ' + error.message);
      }
    }
  };

  const handleCreateFromDraft = async (draft) => {
    try {
      // Преобразуем данные черновика в формат закупки
      const products = draft.products_data ? JSON.parse(draft.products_data) : [];
      
      const procurementData = {
        title: draft.title,
        description: draft.description,
        customer_name: draft.customer_name,
        customer_inn: draft.customer_inn,
        current_price: draft.estimated_price,
        law_type: draft.law_type,
        contract_terms: draft.contract_terms,
        location: draft.location,
        start_date: draft.start_date,
        end_date: draft.end_date,
        products: products.map(product => ({
          product_id: product.product_id,
          required_quantity: product.quantity,
          max_price: product.price_per_item
        }))
      };

      // Создаем закупку из черновика
      const response = await procurementsAPI.create(procurementData);
      
      // Удаляем черновик после успешного создания
      await draftsAPI.deleteDraft(draft.id);
      
      alert('Закупка успешно создана из черновика!');
      loadDrafts(); // Обновляем список черновиков
      
      // Закрываем профиль
      onClose();
      
    } catch (error) {
      alert('Ошибка при создании закупки из черновика: ' + error.message);
    }
  };

  return (
    <div className="user-profile">
      <div className="profile-header">
        <h2>Личный кабинет</h2>
        <p>Управление вашим профилем и активностями</p>
      </div>

      <div className="profile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          👤 Профиль
        </button>
        <button 
          className={`tab-btn ${activeTab === 'procurements' ? 'active' : ''}`}
          onClick={() => setActiveTab('procurements')}
        >
          📋 Мои закупки
        </button>
        <button 
          className={`tab-btn ${activeTab === 'participations' ? 'active' : ''}`}
          onClick={() => setActiveTab('participations')}
        >
          🤝 Мои участия
        </button>
        <button 
          className={`tab-btn ${activeTab === 'drafts' ? 'active' : ''}`}
          onClick={() => setActiveTab('drafts')}
        >
          📝 Мои черновики
        </button>
      </div>

      {/* Вкладка Профиль */}
      {activeTab === 'profile' && (
        <div className="tab-content">
          <div className="profile-info">
            <div className="info-section">
              <h3>Основная информация</h3>
              {editing ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>ФИО</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Введите ваше ФИО"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="Введите ваш email"
                    />
                  </div>
                  <div className="form-group">
                    <label>Название компании</label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      placeholder="Введите название компании"
                    />
                  </div>
                  <div className="form-group">
                    <label>Телефон</label>
                    <input
                      type="tel"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      placeholder="Введите номер телефона"
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn-primary" onClick={handleSaveProfile}>
                      Сохранить
                    </button>
                    <button className="btn-outline" onClick={handleEditToggle}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="info-display">
                  <div className="info-item">
                    <span className="label">ФИО:</span>
                    <span className="value">{user?.name || 'Не указано'}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Email:</span>
                    <span className="value">{user?.email}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Компания:</span>
                    <span className="value">{user?.company_name || 'Не указано'}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">ИНН:</span>
                    <span className="value">{user?.INN || 'Не указан'}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Телефон:</span>
                    <span className="value">{user?.phone_number || 'Не указан'}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Дата регистрации:</span>
                    <span className="value">
                      {user?.created_at ? formatDate(user.created_at) : 'Неизвестно'}
                    </span>
                  </div>
                  <button className="btn-primary" onClick={handleEditToggle}>
                    Редактировать профиль
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Вкладка Мои закупки */}
      {activeTab === 'procurements' && (
        <div className="tab-content">
          <h3>Мои закупки</h3>
          
          {procurementsLoading ? (
            <div className="loading">Загрузка закупок...</div>
          ) : userProcurements.length === 0 ? (
            <div className="empty-state">
              <p>У вас еще нет созданных закупок</p>
            </div>
          ) : (
            <div className="procurements-list">
              {userProcurements.map(procurement => (
                <div key={procurement.id} className="procurement-item">
                  <div className="procurement-info">
                    <h4>{procurement.title}</h4>
                    <div className="procurement-details">
                      <span className="status-badge">{procurement.status}</span>
                      <span>{formatPrice(procurement.current_price)} ₽</span>
                      <span>{procurement.products_count || 0} товаров</span>
                      <span>Создана: {formatDate(procurement.created_at)}</span>
                    </div>
                    {procurement.customer_name && (
                      <p className="customer">Заказчик: {procurement.customer_name}</p>
                    )}
                  </div>
                  <div className="procurement-actions">
                    <button className="btn-outline btn-small">
                      Просмотреть
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Вкладка Мои участия */}
      {activeTab === 'participations' && (
        <div className="tab-content">
          <h3>Мои участия в закупках</h3>
          
          {participationsLoading ? (
            <div className="loading">Загрузка участий...</div>
          ) : userParticipations.length === 0 ? (
            <div className="empty-state">
              <p>Вы еще не участвовали в закупках</p>
            </div>
          ) : (
            <div className="participations-list">
              {userParticipations.map(participation => (
                <div key={participation.procurement_id} className="participation-item">
                  <div className="participation-info">
                    <h4>{participation.procurement_title}</h4>
                    <div className="participation-details">
                      <span className="status-badge">{participation.status}</span>
                      <span>Предложенная цена: {formatPrice(participation.proposed_price)} ₽</span>
                      <span>Дата: {formatDate(participation.created_at)}</span>
                    </div>
                    <p className="customer">Заказчик: {participation.customer_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Вкладка Мои черновики */}
      {activeTab === 'drafts' && (
        <div className="tab-content">
          <h3>Мои черновики закупок</h3>
          
          {draftsLoading ? (
            <div className="loading">Загрузка черновиков...</div>
          ) : drafts.length === 0 ? (
            <div className="empty-state">
              <p>У вас нет сохраненных черновиков</p>
              <p>Создайте закупку и нажмите "Сохранить черновик" чтобы сохранить прогресс</p>
            </div>
          ) : (
            <div className="drafts-list">
              {drafts.map(draft => (
                <div key={draft.id} className="draft-item">
                  <div className="draft-info">
                    <h4>{draft.title}</h4>
                    <div className="draft-details">
                      <span>Товаров: {draft.products_data ? JSON.parse(draft.products_data).length : 0}</span>
                      <span>Шаг: {draft.step || 1}</span>
                      <span>Обновлен: {formatDate(draft.updated_at)}</span>
                      {draft.estimated_price > 0 && (
                        <span>Цена: {formatPrice(draft.estimated_price)} ₽</span>
                      )}
                    </div>
                    {draft.customer_name && (
                      <p className="customer">Заказчик: {draft.customer_name}</p>
                    )}
                    {draft.description && (
                      <p className="description">{draft.description}</p>
                    )}
                  </div>
                  <div className="draft-actions">
                    <button 
                      className="btn-primary btn-small"
                      onClick={() => handleContinueDraft(draft)}
                    >
                      Продолжить
                    </button>
                    <button 
                      className="btn-outline btn-small"
                      onClick={() => handleCreateFromDraft(draft)}
                    >
                      Создать закупку
                    </button>
                    <button 
                      className="btn-outline btn-small"
                      onClick={() => handleDeleteDraft(draft.id, draft.title)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="profile-footer">
        <button className="btn-outline" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default UserProfile;