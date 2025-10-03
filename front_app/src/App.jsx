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
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <h1>SpeedOfLight</h1>
        </div>
        
        <div className="header-actions">
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
            <h5>Возможности</h5>
            <a href="#">Автоматизация</a>
            <a href="#">Аналитика</a>
            <a href="#">Безопасность</a>
          </div>
          
          <div className="footer-section">
            <h5>Компания</h5>
            <a href="#">О нас</a>
            <a href="#">Контакты</a>
            <a href="#">Вакансии</a>
          </div>
          
          <div className="footer-section">
            <h5>Поддержка</h5>
            <a href="#">Помощь</a>
            <a href="#">Документация</a>
            <a href="#">Сообщество</a>
          </div>
          
          <div className="footer-section">
            <h5>Контакты</h5>
            <div className="contact-info">
              <p>🛡️ +7 (999) 999-99-99</p>
              <p>🛡️ hello@speedoflight.ru</p>
              <p>🛡️ Москва, ул. мира, 42</p>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; 2024 SpeedOfLight. Все права защищены.</p>
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