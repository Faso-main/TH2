/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// modal/UserProfile.jsx
import { useState, useEffect } from 'react';
import { userAPI, draftsAPI } from '../services/api';
import './UserProfile.css';

function UserProfile({ user, onClose, onCreateProcurement, onProcurementCreated, onContinueDraft}) {
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
  const [myDrafts, setMyDrafts] = useState([]); // Новое состояние для черновиков
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
    } else if (activeTab === 'drafts') { // Новый обработчик для черновиков
      loadMyDrafts();
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

  // Новая функция для загрузки черновиков
  const loadMyDrafts = async () => {
    try {
      setLoading(true);
      try {
        const data = await draftsAPI.getMyDrafts();
        setMyDrafts(data.drafts || []);
      } catch (error) {
        console.warn('API черновиков недоступно, используем тестовые данные');
        // Тестовые данные для демонстрации
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

  // Функция для продолжения работы с черновиком
  const handleContinueDraft = (draft) => {
    // Закрываем модалку профиля
    onClose();
    
    // Здесь можно передать данные черновика в компонент создания закупки
    // Например, через глобальное состояние или callback
    console.log('Продолжение черновика:', draft);
    
    // Пока просто показываем сообщение
    alert(`Продолжение работы с черновиком: "${draft.title}"`);
  };

  // Функция для удаления черновика
  const handleDeleteDraft = async (draftId) => {
    if (window.confirm('Вы уверены, что хотите удалить этот черновик?')) {
      try {
        await draftsAPI.deleteDraft(draftId);
        // Обновляем список черновиков
        setMyDrafts(prev => prev.filter(draft => draft.id !== draftId));
        alert('Черновик успешно удален');
      } catch (error) {
        alert('Ошибка при удалении черновика: ' + error.message);
      }
    }
  };

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="user-welcome">
          <div className="user-avatar">
            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-info">
            <h3>{user.name || 'Пользователь'}</h3>
            <p>{user.email}</p>
            {user.INN && <p className="inn-display">ИНН: {user.INN}</p>}
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          Профиль
        </button>
        <button className={`tab-btn ${activeTab === 'procurements' ? 'active' : ''}`} onClick={() => setActiveTab('procurements')}>
          Мои закупки
        </button>
        <button className={`tab-btn ${activeTab === 'participations' ? 'active' : ''}`} onClick={() => setActiveTab('participations')}>
          Мои участия
        </button>
        <button className={`tab-btn ${activeTab === 'drafts' ? 'active' : ''}`} onClick={() => setActiveTab('drafts')}>
          Черновики
        </button>
        <button className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
          Избранное
        </button>
      </div>

      <div className="profile-content">
        {activeTab === 'profile' && <ProfileForm user={user} onClose={onClose} />}
        {activeTab === 'procurements' && <UserProcurements user={user} />}
        {activeTab === 'participations' && <UserParticipations user={user} />}
        {activeTab === 'drafts' && <UserDrafts user={user} onContinueDraft={onContinueDraft} />}
  {/* ВРЕМЕННО ЗАКОММЕНТИРОВАТЬ
  {activeTab === 'favorites' && <FavoritesTab user={user} />}
  */}      </div>
          </div>
  );
}

export default UserProfile;