// App.jsx
import { useState } from 'react';
import './App.css';
import './Body.css';
import './Header.css';
import Modal from './modal/Modal';
import LoginForm from './modal/LoginForm';
import RegisterForm from './modal/RegisterForm';

// И обновим вызов Header в компоненте App
function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');

  const openModal = (modalName) => {
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
  };

  return (
    <div className="app">
      <Header onOpenLogin={() => openModal('auth')} />
      <Main onOpenAuth={() => openModal('auth')} />
      <Footer />

      {/* Модальное окно авторизации/регистрации */}
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
          />
        ) : (
          <RegisterForm 
            onClose={closeModal}
            onSwitchToLogin={() => switchAuthMode('login')}
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
        <button className="user-icon-btn">
            <svg 
              width="35" 
              height="35" 
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

// App.jsx - полностью переписанный компонент Main
function Main() {
  return (
    <main className="main">
      <div className="products-container">
        <div className="products-layout">
          {/* Основной блок товаров - 75% */}
          <section className="products-main">
            <div className="products-header">
              <h2>Товары</h2>
              <span className="products-count">Найдено 24 товара</span>
            </div>
            
            <div className="products-grid">
              {/* Карточка товара 1 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Смартфон Apple iPhone 15 Pro</h3>
                  <p className="product-category">Электроника</p>
                  <div className="product-price">
                    <span className="current-price">89 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 2 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Кроссовки Nike Air Max</h3>
                  <p className="product-category">Обувь</p>
                  <div className="product-price">
                    <span className="current-price">12 499 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 3 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Ноутбук MacBook Pro 16"</h3>
                  <p className="product-category">Электроника</p>
                  <div className="product-price">
                    <span className="current-price">199 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 4 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Часы Apple Watch Series 9</h3>
                  <p className="product-category">Электроника</p>
                  <div className="product-price">
                    <span className="current-price">34 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 5 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Футболка хлопковая</h3>
                  <p className="product-category">Одежда</p>
                  <div className="product-price">
                    <span className="current-price">1 499 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 6 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Наушники Sony WH-1000XM4</h3>
                  <p className="product-category">Электроника</p>
                  <div className="product-price">
                    <span className="current-price">24 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 7 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Планшет iPad Air 5</h3>
                  <p className="product-category">Электроника</p>
                  <div className="product-price">
                    <span className="current-price">54 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>

              {/* Карточка товара 8 */}
              <div className="product-card">
                <div className="product-image">
                  <img src="https://via.placeholder.com/200x200" alt="Товар" />
                  <button className="wishlist-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
                <div className="product-info">
                  <h3 className="product-title">Куртка зимняя</h3>
                  <p className="product-category">Одежда</p>
                  <div className="product-price">
                    <span className="current-price">8 999 ₽</span>
                  </div>
                  <button className="add-to-cart-btn">
                    В корзину
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Блок фильтров - 25% */}
          <aside className="filters-sidebar">
            <div className="filters-header">
              <h3>Фильтры</h3>
              <button className="clear-filters-btn">Очистить</button>
            </div>

            <div className="filters-section">
              <h4>Категории</h4>
              <div className="filter-options">
                <label className="filter-option">
                  <input type="checkbox" defaultChecked />
                  <span>Электроника</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Одежда</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Обувь</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Аксессуары</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Красота</span>
                </label>
              </div>
            </div>

            <div className="filters-section">
              <h4>Цена</h4>
              <div className="price-range">
                <div className="price-inputs">
                  <input type="number" placeholder="0" className="price-input" />
                  <span>-</span>
                  <input type="number" placeholder="100000" className="price-input" />
                </div>
              </div>
            </div>

            <div className="filters-section">
              <h4>Бренд</h4>
              <div className="filter-options">
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Apple</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Samsung</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Xiaomi</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Nike</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>Sony</span>
                </label>
              </div>
            </div>

            <div className="filters-section">
              <h4>Рейтинг</h4>
              <div className="filter-options">
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>★★★★★</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>★★★★ и выше</span>
                </label>
                <label className="filter-option">
                  <input type="checkbox" />
                  <span>★★★ и выше</span>
                </label>
              </div>
            </div>

            <button className="apply-filters-btn">
              Применить фильтры
            </button>
          </aside>
        </div>
      </div>
    </main>
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
            <p>&copy; 2025 SpeedOfLight. Все права защищены.</p>
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