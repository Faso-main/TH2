// components/RegisterForm.jsx
import { useState } from 'react';
import './AuthForms.css';

function RegisterForm({ onClose, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    INN: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Register data:', formData);
    // Здесь будет логика регистрации
    onClose();
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="name">Имя</label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Введите ваше имя"
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Введите ваш email"
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="INN">Пароль</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          placeholder="Придумайте пароль"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">ИНН</label>
        <input
          type="text"
          id="INN"
          name="INN"
          value={formData.INN}
          onChange={handleChange}
          placeholder="123456789456"
          required
        />
      </div>
      

      
      <button type="submit" className="btn-primary btn-full">
        Зарегистрироваться
      </button>
      
      <div className="auth-switch">
        <p>Уже есть аккаунт? <button type="button" onClick={onSwitchToLogin}>Войти</button></p>
      </div>
    </form>
  );
}

export default RegisterForm;