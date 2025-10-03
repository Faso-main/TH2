// App.jsx
import './App.css'

function App() {
  return (
    <div className="app">
      <Header />
      <Main />
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <h1>SpeedOfLight</h1>
        </div>
        
        <div className="header-actions">
          <button className="btn-secondary">Регистрация</button>
          <button className="btn-primary">Войти</button>
        </div>

        {/* Мобильное меню */}
        <button className="mobile-menu-btn">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  )
}

function Main() {
  return (
    <main className="main">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <h2>Откройте мир современных покупок</h2>
            <p>Более 10 000 товаров от проверенных продавцов с быстрой доставкой по всему миру</p>
            <div className="hero-actions">
              <button className="btn-hero-primary">Начать покупки</button>
              <button className="btn-hero-secondary">Узнать больше</button>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-number">10K+</div>
              <div className="stat-label">Товаров</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">500+</div>
              <div className="stat-label">Продавцов</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">50K+</div>
              <div className="stat-label">Покупателей</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-section">
        <div className="section-container">
          <div className="section-header">
            <h3>Почему выбирают нас</h3>
            <p>Лучший сервис для ваших покупок</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h4>Гарантия качества</h4>
              <p>Все товары проходят строгую проверку перед отправкой</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h4>Безопасная оплата</h4>
              <p>Различные способы оплаты включая карты и электронные кошельки</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h4>Защита покупателя</h4>
              <p>Возврат средств в случае проблем с заказом</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h4>Поддержка 24/7</h4>
              <p>Круглосуточная поддержка по всем вопросам</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="section-container">
          <div className="cta-content">
            <h3>Готовы начать покупки?</h3>
            <p>Присоединяйтесь к миллионам довольных покупателей</p>
            <button className="btn-cta">Создать аккаунт</button>
          </div>
        </div>
      </section>
    </main>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>MarketPlace</h4>
            <p>Ваш надежный партнер в покупках. Лучшие товары по выгодным ценам с гарантией качества.</p>
          </div>
          
          <div className="footer-section">
            <h5>Магазин</h5>
            <a href="#">Все товары</a>
            <a href="#">Новинки</a>
            <a href="#">Популярное</a>
          </div>
          
          <div className="footer-section">
            <h5>Информация</h5>
            <a href="#">О компании</a>
            <a href="#">Доставка</a>
            <a href="#">Оплата</a>
          </div>
          
          <div className="footer-section">
            <h5>Помощь</h5>
            <a href="#">Центр поддержки</a>
            <a href="#">Возвраты</a>
            <a href="#">Статус заказа</a>
          </div>
          
          <div className="footer-section">
            <h5>Контакты</h5>
            <div className="contact-info">
              <p>🛡️ +7 (999) 999-99-99</p>
              <p>🛡️ email@example.com</p>
              <p>🛡️ Москва, ул. Примерная, 123</p>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; 2024 MarketPlace. Все права защищены.</p>
            <div className="footer-links">
              <a href="#">Политика конфиденциальности</a>
              <a href="#">Условия использования</a>
              <a href="#">Карта сайта</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default App