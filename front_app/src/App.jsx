import { useState, useEffect } from 'react';
import './App.css';
import './Body.css';
import './Header.css';
import Modal from './modal/Modal';
import LoginForm from './modal/LoginForm';
import RegisterForm from './modal/RegisterForm';
import { authAPI, productsAPI, procurementsAPI} from './services/api';
import { generateProductImage, getCategoryColor } from './utils/productImages';

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [procurements, setProcurements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Загрузка данных при старте
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      // Загружаем товары и закупки параллельно
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
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    closeModal();
  };

  const handleLogout = () => {
    authAPI.logout();
    setCurrentUser(null);
  };

  const handleSearch = async (searchQuery) => {
    try {
      setLoading(true);
      const response = await productsAPI.getProducts({ search: searchQuery });
      setProducts(response.products);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
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
        proposal_text: `Готов поставить товары по указанной цене`
      });
      alert('Заявка на участие отправлена!');
      // Обновляем данные закупок
      const response = await procurementsAPI.getProcurements();
      setProcurements(response.procurements);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="app">
      <Header 
        onOpenLogin={() => openModal('auth')} 
        currentUser={currentUser}
        onLogout={handleLogout}
        onSearch={handleSearch}
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
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </Modal>
    </div>
  );
}

function Header({ onOpenLogin }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    if (e) {
      e.preventDefault();
    }
    // Здесь будет логика поиска
    console.log('Поиск:', searchQuery);
    // Можно добавить фильтрацию товаров по поисковому запросу
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
        
        {/* Поисковая строка в шапке */}
        <div className="header-search">
          <form className="search-bar" onSubmit={handleSearch}>
            <input 
              type="text" 
              placeholder="Поиск товаров..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyUp ={handleKeyPress}
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
        <button className="user-icon-btn">
            <svg 
              width="50" 
              height="50" 
              viewBox="0 0 512 512" 
              fill="currentColor"
            >
              <path d="M395.636,279.273h-23.273h-31.03v186.182v23.273V512h54.303c12.853,0,23.273-10.422,23.273-23.273V279.273H395.636z"/>
              <polygon points="217.212,279.273 217.212,465.455 217.212,488.727 217.212,512 294.788,512 294.788,488.727 294.788,465.455 294.788,279.273"/>
              <path d="M139.636,279.273h-23.273H93.091v209.455c0,12.851,10.42,23.273,23.273,23.273h54.303v-23.273v-23.273V279.273H139.636z"/>
              <path d="M442.182,186.182h-23.273v-69.818c0-12.853-10.42-23.273-23.273-23.273h-38.788V23.273C356.849,10.42,346.429,0,333.576,0H178.424c-12.853,0-23.273,10.42-23.273,23.273v69.818h-38.788c-12.853,0-23.273,10.42-23.273,23.273v69.818H69.818c-12.853,0-23.273,10.418-23.273,23.273c0,12.851,10.42,23.273,23.273,23.273h23.273h23.273h23.273h31.03h46.545h77.576h46.545h31.03h23.273h23.273h23.273c12.853,0,23.273-10.422,23.273-23.273C465.455,196.6,455.035,186.182,442.182,186.182z M310.303,93.091H201.697V46.545h108.606V93.091z"/>
            </svg>
          </button>
          <button className="user-icon-btn" onClick={onOpenLogin}>
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
        </div>

        <button className="mobile-menu-btn">
          <span></span>
          <span></span>
          <span></span>
        </button>
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
            <h4>Поддержка</h4>
            <a href="#">Помощь</a>
            <a href="#">Документация</a>
            <a href="#">Сообщество</a>
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
              <a href="#">Карта сайта</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default App;