// App.jsx
import { useState } from 'react';
import './App.css';
import Modal from './modal/Modal';
import LoginForm from './modal/LoginForm';
import RegisterForm from './modal/RegisterForm';

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
      <Header 
        onOpenLogin={() => openModal('auth')} 
        switchAuthMode={switchAuthMode} 
      />
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

// И обновите пропсы Header компонента
function Header({ onOpenLogin, switchAuthMode }) {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <h1>SpeedOfLight</h1>
        </div>
        
        <div className="header-actions">
          <button className="cart-icon-btn">
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 512 512" 
              fill="currentColor"
            >
              <path d="M395.636,279.273h-23.273h-31.03v186.182v23.273V512h54.303c12.853,0,23.273-10.422,23.273-23.273V279.273H395.636z"/>
              <polygon points="217.212,279.273 217.212,465.455 217.212,488.727 217.212,512 294.788,512 294.788,488.727 294.788,465.455 294.788,279.273"/>
              <path d="M139.636,279.273h-23.273H93.091v209.455c0,12.851,10.42,23.273,23.273,23.273h54.303v-23.273v-23.273V279.273H139.636z"/>
              <path d="M442.182,186.182h-23.273v-69.818c0-12.853-10.42-23.273-23.273-23.273h-38.788V23.273C356.849,10.42,346.429,0,333.576,0H178.424c-12.853,0-23.273,10.42-23.273,23.273v69.818h-38.788c-12.853,0-23.273,10.42-23.273,23.273v69.818H69.818c-12.853,0-23.273,10.418-23.273,23.273c0,12.851,10.42,23.273,23.273,23.273h23.273h23.273h23.273h31.03h46.545h77.576h46.545h31.03h23.273h23.273h23.273c12.853,0,23.273-10.422,23.273-23.273C465.455,196.6,455.035,186.182,442.182,186.182z M310.303,93.091H201.697V46.545h108.606V93.091z"/>
            </svg>
          </button>
          
          <button className="btn-secondary" onClick={() => {
            onOpenLogin('auth');
            setTimeout(() => switchAuthMode('register'), 0);
          }}>
            Регистрация
          </button>
          <button className="btn-primary" onClick={onOpenLogin}>
            Войти
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

function Main() {
  return (
    <main className="main">
      <h1 className="mainplaceholder">Main Content</h1>
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