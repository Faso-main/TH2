// components/LoginForm.jsx
import { useState } from 'react';
import './AuthForms.css';

function LoginForm({ onClose, onSwitchToRegister }) {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Login data:', formData);
    // Здесь будет логика авторизации
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
        <label htmlFor="password">Пароль</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          placeholder="Введите ваш пароль"
          required
        />
      </div>
      
      <button type="submit" className="btn-primary btn-full">
        Войти
      </button>
      
      <div className="auth-switch">
        <p>Нет аккаунта? <button type="button" onClick={onSwitchToRegister}>Зарегистрироваться</button></p>
      </div>
    </form>
  );
}

export default LoginForm;