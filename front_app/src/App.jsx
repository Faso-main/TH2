import { useState, useEffect } from 'react';
import './App.css';
import './Body.css';
import './Header.css';
import Modal from './modal/Modal';
import LoginForm from './modal/LoginForm';
import RegisterForm from './modal/RegisterForm';
import UserProfile from './modal/UserProfile';
import { authAPI, productsAPI, procurementsAPI } from './services/api';
import { generateProductImage, getCategoryColor } from './utils/productImages';


function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [procurements, setProcurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Загрузка данных при старте
  useEffect(() => {
    const user = authAPI.getCurrentUser();
    if (user && authAPI.isAuthenticated()) {
      setCurrentUser(user);
    }
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);


      const [productsResponse, procurementsResponse] = await Promise.all([
          productsAPI.getProducts({ limit: 20 }),
          procurementsAPI.getProcurements({ limit: 10 })
        ]);
        
      setProducts(productsResponse.products);
      setProcurements(procurementsResponse.procurements);

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (modalName) => {
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
    setAuthMode('login');
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    closeModal();
    // Показываем уведомление об успешной авторизации
    setTimeout(() => {
      alert(`Добро пожаловать, ${user.name}!`);
    }, 100);
  };

  const handleRegisterSuccess = (user) => {
    setCurrentUser(user);
    closeModal();
    // Показываем уведомление об успешной регистрации
    setTimeout(() => {
      alert(`Регистрация успешна! Добро пожаловать, ${user.name}!`);
    }, 100);
  };

  const handleLogout = async () => {
    try {
      setAuthLoading(true);
      await authAPI.logout();
      setCurrentUser(null);
      alert('Вы успешно вышли из системы');
    } catch (error) {
      console.error('Logout error:', error);
      // Все равно сбрасываем состояние, даже если запрос не удался
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUserProfileClick = () => {
    if (currentUser) {
      openModal('profile');
    } else {
      openModal('auth');
    }
  };

  const handleParticipate = async (procurementId, proposedPrice) => {
    if (!currentUser) {
      openModal('auth');
      return;
    }

    try {
      await procurementsAPI.participate(procurementId, {
        proposed_price: proposedPrice,
        proposal_text: `Готов поставить товары по цене ${proposedPrice} ₽`
      });
      alert('Заявка на участие отправлена!');
      // Обновляем данные закупок
      const response = await procurementsAPI.getProcurements();
      setProcurements(response.procurements);
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  };

  return (
    <div className="app">
      <Header 
        currentUser={currentUser}
        onLogout={handleLogout}
        onUserProfileClick={handleUserProfileClick}
        authLoading={authLoading}
      />
      
      <Main 
        products={products}
        procurements={procurements}
        loading={loading}
        currentUser={currentUser}
        onParticipate={handleParticipate}
        onOpenAuth={() => openModal('auth')}
      />
      
      <Footer />

      {/* Модальное окно авторизации */}
      <Modal
        isOpen={activeModal === 'auth'}
        onClose={closeModal}
        title={authMode === 'login' ? 'Вход в аккаунт' : 'Создание аккаунта'}
        size="small"
      >
        {authMode === 'login' ? (
          <LoginForm 
            onClose={closeModal}
            onSwitchToRegister={() => switchAuthMode('register')}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : (
          <RegisterForm 
            onClose={closeModal}
            onSwitchToLogin={() => switchAuthMode('login')}
            onRegisterSuccess={handleRegisterSuccess}
          />
        )}
      </Modal>

      {/* Модальное окно личного кабинета */}
      <Modal
        isOpen={activeModal === 'profile'}
        onClose={closeModal}
        title="Личный кабинет"
        size="large"
      >
        <UserProfile 
          user={currentUser} 
          onClose={closeModal}
        />
      </Modal>
    </div>
  );
}

function Header({ currentUser, onLogout, onUserProfileClick, authLoading }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    console.log('Поиск:', searchQuery);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <h1>SpeedOfLight</h1>
        </div>
        
        <div className="header-search">
          <form className="search-bar" onSubmit={handleSearch}>
            <input 
              type="text" 
              placeholder="Поиск товаров..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button type="submit" className="search-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </button>
          </form>
        </div>

        <div className="header-actions">
          {/* Иконка личного кабинета */}
          <button 
            className={`user-icon-btn ${currentUser ? 'user-authenticated' : ''}`} 
            onClick={onUserProfileClick} 
            title={currentUser ? 'Личный кабинет' : 'Войти'}
            disabled={authLoading}
          >
            <svg 
              width="35"
              height="35" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>

          {/* Кнопка выхода, если пользователь авторизован */}
          {currentUser && (
            <button 
              className="user-icon-btn logout-btn" 
              onClick={onLogout} 
              title="Выйти"
              disabled={authLoading}
            >
              {authLoading ? (
                <div className="loading-spinner-small"></div>
              ) : (
                <svg 
                  width="35"
                  height="35" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Main({ products, procurements, loading, currentUser, onParticipate, onOpenAuth }) {
  const [activeSection, setActiveSection] = useState('products');

  if (loading) {
    return (
      <main className="main">
        <div className="products-container">
          <div className="loading">Загрузка...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="products-container">
        <div className="products-layout">
          <section className="products-main">
            <div className="products-header">
              <div className="section-buttons">
                <button 
                  className={`section-btn ${activeSection === 'products' ? 'active' : ''}`}
                  onClick={() => setActiveSection('products')}
                >
                  Товары
                </button>
                <button 
                  className={`section-btn ${activeSection === 'procurements' ? 'active' : ''}`}
                  onClick={() => setActiveSection('procurements')}
                >
                  Закупки
                </button>
              </div>
              <span className="products-count">
                {activeSection === 'products' 
                  ? `Найдено ${products.length} товаров` 
                  : `Активные закупки: ${procurements.length}`
                }
              </span>
            </div>
            
            {activeSection === 'products' ? (
              <ProductsGrid products={products} />
            ) : (
              <ProcurementsGrid 
                procurements={procurements}
                currentUser={currentUser}
                onParticipate={onParticipate}
                onOpenAuth={onOpenAuth}
              />
            )}
          </section>

          <FiltersSidebar activeSection={activeSection} />
        </div>
      </div>
    </main>
  );
}

// Компонент сетки товаров
function ProductsGrid({ products }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  return (
    <div className="products-grid">
      {products.map(product => {
        const categoryColor = getCategoryColor(product.category_name);
        const imageUrl = generateProductImage(product.name, categoryColor);
        
        return (
          <div key={product.id} className="product-card">
            <div className="product-image">
              <img 
                src={imageUrl}
                alt={product.name}
                onError={(e) => {
                  // Fallback на CSS placeholder если SVG не загрузится
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div className="product-image-fallback" style={{display: 'none'}}>
                {product.name}
              </div>
              <button className="wishlist-btn">♥</button>
            </div>
            <div className="product-info">
              <h3 className="product-title">{product.name}</h3>
              <p className="product-category">{product.category_name}</p>
              <div className="product-price">
                <span className="current-price">{formatPrice(product.price_per_item)} ₽</span>
              </div>
              <p className="product-stock">В наличии: {product.amount} шт.</p>
              <button className="add-to-cart-btn">
                В корзину
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Компонент сетки закупок
function ProcurementsGrid({ procurements, onParticipate }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'active': return { class: 'active', text: 'Активна' };
      case 'soon': return { class: 'soon', text: 'Скоро' };
      case 'completed': return { class: 'completed', text: 'Завершена' };
      default: return { class: 'active', text: status };
    }
  };

  return (
    <div className="procurements-grid">
      {procurements.map(procurement => {
        const statusInfo = getStatusInfo(procurement.status);
        
        return (
          <div key={procurement.id} className="procurement-card">
            <div className="procurement-header">
              <h3 className="procurement-title">{procurement.title}</h3>
              <span className={`procurement-status ${statusInfo.class}`}>
                {statusInfo.text}
              </span>
            </div>
            
            <div className="procurement-info">
              <p className="procurement-description">
                {procurement.description}
              </p>
              
              <div className="procurement-details">
                <div className="detail-item">
                  <span className="detail-label">Текущая цена:</span>
                  <span className="detail-value">{formatPrice(procurement.current_price)} ₽</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Заказчик:</span>
                  <span className="detail-value">{procurement.customer_name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Даты проведения:</span>
                  <span className="detail-value">
                    {formatDate(procurement.start_date)} - {formatDate(procurement.end_date)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Участников:</span>
                  <span className="detail-value">{procurement.participants_count}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Товаров в закупке:</span>
                  <span className="detail-value">{procurement.products?.length || 0}</span>
                </div>
              </div>

              {/* Товары в закупке */}
              {procurement.products && procurement.products.length > 0 && (
                <div className="procurement-products">
                  <h4>Товары в закупке:</h4>
                  {procurement.products.map(product => (
                    <div key={product.id} className="procurement-product-item">
                      <span>{product.product_name}</span>
                      <span>{product.required_quantity} шт.</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Кнопки действий */}
              {procurement.status === 'active' && (
                <button 
                  className="participate-btn"
                  onClick={() => onParticipate(procurement.id, procurement.current_price * 0.95)}
                >
                  Участвовать
                </button>
              )}
              
              {procurement.status === 'soon' && (
                <button className="notify-btn">
                  Уведомить о старте
                </button>
              )}
              
              {procurement.status === 'completed' && (
                <button className="view-results-btn">
                  Посмотреть результаты
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Компонент фильтров (упрощенный)
function FiltersSidebar({ activeSection }) {
  return (
    <aside className="filters-sidebar">
      <div className="filters-header">
        <h3>Фильтры</h3>
        <button className="clear-filters-btn">Очистить</button>
      </div>
      
      {activeSection === 'products' ? (
        <>
          <div className="filters-section">
            <h4>Цена, ₽</h4>
            <div className="price-range">
              <div className="price-inputs">
                <input type="number" placeholder="0" className="price-input" />
                <span>-</span>
                <input type="number" placeholder="100000" className="price-input" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="filters-section">
            <h4>Статус закупки</h4>
            <div className="filter-options">
              <label className="filter-option">
                <input type="checkbox" defaultChecked />
                <span>Активные</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" />
                <span>Скоро начнутся</span>
              </label>
            </div>
          </div>
        </>
      )}
      
      <button className="apply-filters-btn">
        Применить фильтры
      </button>
    </aside>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>SpeedOfLight</h4>
            <p>Современная платформа для бизнеса. Быстро, безопасно, эффективно.</p>
          </div>
          
          <div className="footer-section">
            <h4>Возможности</h4>
            <a href="#">Автоматизация</a>
            <a href="#">Аналитика</a>
            <a href="#">Безопасность</a>
          </div>
          
          <div className="footer-section">
            <h4>Компания</h4>
            <a href="#">О нас</a>
            <a href="#">Контакты</a>
            <a href="#">Вакансии</a>
          </div>
          
          <div className="footer-section">
            <h4>Контакты</h4>
            <div className="contact-info">
              <p>🛡️ +7 (999) 999-99-99</p>
              <p>🛡️ hello@speedoflight.ru</p>
              <p>🛡️ Москва, ул. мира, 42</p>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; 2025 SpeedOfLight</p>
            <div className="footer-links">
              <a href="#">Политика конфиденциальности</a>
              <a href="#">Условия использования</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default App;