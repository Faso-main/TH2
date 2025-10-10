/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
// modal/CreateProcurement.jsx
import { useState, useEffect } from 'react';
import './CreateProcurement.css';

function CreateProcurement({ onClose, onCreate, selectedProducts, onUpdateQuantity, onRemoveProduct, currentUser }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    session_number: '',
    customer_name: '',
    customer_inn: '',
    current_price: '',
    start_date: '',
    end_date: '',
    law_type: '44-ФЗ',
    contract_terms: '',
    contract_security: '',
    location: ''
  });
  const [loading, setLoading] = useState(false);

  // Генерация номера сессии и установка данных при монтировании
  useEffect(() => {
    generateSessionNumber();
    setDefaultCustomerInfo();
    setDefaultDates();
  }, []);

  // Генерация номера котировочной сессии
  const generateSessionNumber = () => {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000);
    const sessionNumber = `КОТ-${timestamp}-${random}`;
    setFormData(prev => ({ ...prev, session_number: sessionNumber }));
  };

  // Установка данных заказчика из профиля пользователя
  const setDefaultCustomerInfo = () => {
    if (currentUser) {
      setFormData(prev => ({
        ...prev,
        customer_name: currentUser.company_name || 'Не указано',
        customer_inn: currentUser.INN || '0000000000',
        location: currentUser.location || 'Москва'
      }));
    }
  };

  // Установка дат по умолчанию
  const setDefaultDates = () => {
    const now = new Date();
    const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Завтра
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Через неделю

    setFormData(prev => ({
      ...prev,
      start_date: startDate.toISOString().slice(0, 16),
      end_date: endDate.toISOString().slice(0, 16)
    }));
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const calculateTotalPrice = () => {
    return selectedProducts.reduce((total, product) => {
      return total + (product.price_per_item * product.quantity);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Проверка обязательных полей
      const requiredFields = {
        title: formData.title,
        session_number: formData.session_number,
        current_price: calculateTotalPrice(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        customer_name: formData.customer_name,
        law_type: formData.law_type,
        location: formData.location
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        alert(`Заполните все обязательные поля: ${missingFields.join(', ')}`);
        return;
      }

      if (selectedProducts.length === 0) {
        alert('Добавьте хотя бы один товар в закупку');
        return;
      }

      const totalPrice = calculateTotalPrice();
      
      // Формируем полный объект закупки со всеми обязательными полями
      const procurementData = {
        title: formData.title,
        description: formData.description || `Закупка товаров: ${selectedProducts.map(p => p.name).join(', ')}`,
        session_number: formData.session_number,
        customer_name: formData.customer_name,
        customer_inn: formData.customer_inn,
        current_price: totalPrice,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        law_type: formData.law_type,
        contract_terms: formData.contract_terms || 'Стандартные условия поставки',
        contract_security: formData.contract_security || 'Обеспечение не требуется',
        location: formData.location,
        status: 'active',
        products: selectedProducts.map(product => ({
          product_id: product.id,
          required_quantity: product.quantity,
          max_price: product.price_per_item
        }))
      };

      console.log('Sending procurement data:', procurementData);
      await onCreate(procurementData);
      
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="create-procurement">      
      <form onSubmit={handleSubmit}>
        {/* Секция с выбранными товарами */}
        {selectedProducts.length > 0 && (
          <div className="form-section">
            <div className="section-header">
              <h4>Выбранные товары ({selectedProducts.length})</h4>
            </div>
            
            <div className="selected-products-list">
              {selectedProducts.map(product => (
                <div key={product.id} className="selected-product-item">
                  <div className="product-info">
                    <span className="product-name">{product.name}</span>
                    <span className="product-category">{product.category_name}</span>
                    <span className="product-price">{formatPrice(product.price_per_item)} ₽/шт</span>
                  </div>
                  <div className="product-controls">
                    <div className="quantity-controls">
                      <button 
                        type="button"
                        className="quantity-btn"
                        onClick={() => onUpdateQuantity(product.id, product.quantity - 1)}
                      >
                        -
                      </button>
                      <span className="quantity-display">{product.quantity} шт</span>
                      <button 
                        type="button"
                        className="quantity-btn"
                        onClick={() => onUpdateQuantity(product.id, product.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <div className="product-total">
                      {formatPrice(product.price_per_item * product.quantity)} ₽
                    </div>
                    <button 
                      type="button"
                      className="btn-remove"
                      onClick={() => onRemoveProduct(product.id)}
                      title="Удалить товар"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              
              <div className="selected-products-total">
                <strong>Общая стоимость закупки: {formatPrice(calculateTotalPrice())} ₽</strong>
              </div>
            </div>
          </div>
        )}

        <div className="form-section">
          <h4>Основная информация о закупке</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="title">Название закупки *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="Например: Поставка офисной техники"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="law_type">Тип закупки *</label>
              <select
                id="law_type"
                name="law_type"
                value={formData.law_type}
                onChange={handleChange}
                required
              >
                <option value="44-ФЗ">44-ФЗ</option>
                <option value="223-ФЗ">223-ФЗ</option>
                <option value="Коммерческая">Коммерческая</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Дополнительная информация</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Дополнительные условия, требования к поставщикам, особые условия..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="location">Регион поставки *</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              required
              placeholder="Например: Москва, Московская область"
            />
          </div>
        </div>

        <div className="form-section">
          <h4>Сроки проведения *</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="start_date">Дата начала *</label>
              <input
                type="datetime-local"
                id="start_date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                required
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="end_date">Дата окончания *</label>
              <input
                type="datetime-local"
                id="end_date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                required
                min={formData.start_date || new Date().toISOString().slice(0, 16)}
              />
            </div>
          </div>
        </div>

        {/* Автоматически заполненная информация (только для просмотра) */}
        <div className="form-section">
          <h4>Автоматически заполненные данные</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label>Номер котировочной сессии *</label>
              <input
                type="text"
                value={formData.session_number}
                readOnly
                className="readonly-field"
              />
            </div>
            
            <div className="form-group">
              <label>Заказчик *</label>
              <input
                type="text"
                value={formData.customer_name}
                readOnly
                className="readonly-field"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ИНН заказчика</label>
              <input
                type="text"
                value={formData.customer_inn}
                readOnly
                className="readonly-field"
              />
            </div>
            
            <div className="form-group">
              <label>Начальная цена *</label>
              <input
                type="text"
                value={`${formatPrice(calculateTotalPrice())} ₽`}
                readOnly
                className="readonly-field"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Условия контракта</h4>
          
          <div className="form-group">
            <label htmlFor="contract_terms">Условия исполнения контракта</label>
            <textarea
              id="contract_terms"
              name="contract_terms"
              value={formData.contract_terms}
              onChange={handleChange}
              rows="2"
              placeholder="Стандартные условия поставки"
            />
          </div>

          <div className="form-group">
            <label htmlFor="contract_security">Обеспечение исполнения контракта</label>
            <textarea
              id="contract_security"
              name="contract_security"
              value={formData.contract_security}
              onChange={handleChange}
              rows="2"
              placeholder="Обеспечение не требуется"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            Отмена
          </button>
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading || selectedProducts.length === 0 || !formData.title || !formData.location}
          >
            {loading ? 'Создание...' : `Создать закупку (${selectedProducts.length} товаров)`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateProcurement;