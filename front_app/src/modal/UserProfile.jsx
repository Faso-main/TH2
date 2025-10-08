// modal/UserProfile.jsx
import { useState, useEffect } from 'react';
import { userAPI } from '../services/api';
import './UserProfile.css';

function UserProfile({ user }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState(user);
  const [myProcurements, setMyProcurements] = useState([]);
  const [myParticipations, setMyParticipations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'my-procurements') {
      loadMyProcurements();
    } else if (activeTab === 'participations') {
      loadMyParticipations();
    }
  }, [activeTab]);

  const loadMyProcurements = async () => {
    try {
      setLoading(true);
      const data = await userAPI.getMyProcurements();
      setMyProcurements(data.procurements || []);
    } catch (error) {
      console.error('Error loading procurements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyParticipations = async () => {
    try {
      setLoading(true);
      const data = await userAPI.getMyParticipations();
      setMyParticipations(data.participations || []);
    } catch (error) {
      console.error('Error loading participations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await userAPI.updateProfile(profileData);
      alert('Профиль успешно обновлен!');
    } catch (error) {
      alert('Ошибка при обновлении профиля: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="user-welcome">
          <div className="user-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            {user.company_name && <p>Компания: {user.company_name}</p>}
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
          className={`tab-btn ${activeTab === 'participations' ? 'active' : ''}`}
          onClick={() => setActiveTab('participations')}
        >
          Мои участия
        </button>
      </div>

      <div className="profile-content">
        {activeTab === 'profile' && (
          <form className="profile-form" onSubmit={handleProfileUpdate}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Имя</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={profileData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={profileData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="INN">ИНН</label>
                <input
                  type="text"
                  id="INN"
                  name="INN"
                  value={profileData.INN}
                  onChange={handleInputChange}
                  required
                  disabled
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

            <button 
              type="submit" 
              className="btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </form>
        )}

        {activeTab === 'my-procurements' && (
          <div className="procurements-list">
            <h3>Мои созданные закупки</h3>
            {loading ? (
              <div className="loading">Загрузка...</div>
            ) : myProcurements.length > 0 ? (
              myProcurements.map(procurement => (
                <div key={procurement.id} className="procurement-item">
                  <h4>{procurement.title}</h4>
                  <p>Котировочная сессия: {procurement.session_number}</p>
                  <p>Статус: {procurement.status}</p>
                  <p>Участников: {procurement.participants_count}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>Вы еще не создали ни одной закупки</p>
                <button className="btn-primary">Создать первую закупку</button>
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
              myParticipations.map(participation => (
                <div key={participation.id} className="participation-item">
                  <h4>{participation.procurement_title}</h4>
                  <p>Мое предложение: {participation.proposed_price} ₽</p>
                  <p>Статус: {participation.status}</p>
                  <p>Заказчик: {participation.customer_name}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>Вы еще не участвовали в закупках</p>
                <p>Найдите интересные закупки и подайте заявку!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;