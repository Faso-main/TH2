/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// modal/CreateProcurement.jsx
import { useState, useEffect } from 'react';
import './CreateProcurement.css';

function CreateProcurement({ 
  onClose, 
  onCreate, 
  selectedProducts, 
  onUpdateQuantity, 
  onRemoveProduct, 
  currentUser, 
  onAddProducts,
  step: externalStep,
  onStepChange,
  initialFormData,
  onFormDataChange,
  onClearSavedForm
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    customer_name: '',
    customer_inn: '',
    current_price: '',
    law_type: '44-ФЗ',
    contract_terms: '',
    location: '',
    start_date: '',
    end_date: ''
  });
  
  const [step, setStep] = useState(externalStep || 1);
  const [loading, setLoading] = useState(false);
  const [formValid, setFormValid] = useState(false);

  // Инициализация формы из сохраненных данных или профиля пользователя
  useEffect(() => {
    if (initialFormData) {
      // Восстанавливаем сохраненные данные
      setFormData(initialFormData);
    } else if (currentUser) {
      // Заполняем из профиля пользователя
      setFormData(prev => ({
        ...prev,
        customer_name: currentUser.company_name || '',
        customer_inn: currentUser.INN || '',
        location: currentUser.location || ''
      }));
    }
  }, [currentUser, initialFormData]);

  // Синхронизация с внешним step
  useEffect(() => {
    if (externalStep !== undefined) {
      setStep(externalStep);
    }
  }, [externalStep]);

  // Валидация формы
  useEffect(() => {
    const isValid = formData.title.trim() !== '' && 
                   formData.customer_name.trim() !== '' && 
                   formData.customer_inn.trim() !== '';
    setFormValid(isValid);
  }, [formData]);

  // Сохранение данных формы при изменении
  useEffect(() => {
    if (onFormDataChange && formData.title) {
      onFormDataChange(formData);
    }
  }, [formData, onFormDataChange]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const calculateTotalPrice = () => {
    return selectedProducts.reduce((total, product) => {
      return total + (product.price_per_item * product.quantity);
    }, 0);
  };

  const handleContinueToProducts = (e) => {
    e.preventDefault();
    
    if (!formValid) {
      alert('Заполните обязательные поля: название закупки, название организации и ИНН');
      return;
    }

    // Сохраняем данные перед переходом
    if (onFormDataChange) {
      onFormDataChange(formData);
    }
    
    // Переходим к выбору товаров
    const newStep = 2;
    setStep(newStep);
    if (onStepChange) {
      onStepChange(newStep);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step === 1) {
      handleContinueToProducts(e);
      return;
    }

    // Создаем закупку (шаг 2)
    if (selectedProducts.length === 0) {
      alert('Добавьте хотя бы один товар в закупку');
      return;
    }

    setLoading(true);

    try {
      const totalPrice = calculateTotalPrice();
      const procurementData = {
        title: formData.title,
        description: formData.description,
        customer_name: formData.customer_name,
        customer_inn: formData.customer_inn,
        current_price: totalPrice > 0 ? totalPrice : formData.current_price,
        law_type: formData.law_type,
        contract_terms: formData.contract_terms,
        location: formData.location,
        start_date: formData.start_date,
        end_date: formData.end_date,
        products: selectedProducts.map(product => ({
          product_id: product.id,
          required_quantity: product.quantity,
          max_price: product.price_per_item
        }))
      };

      await onCreate(procurementData);
      
      // Очищаем сохраненные данные после успешного создания
      if (onClearSavedForm) {
        onClearSavedForm();
      }
    } catch (error) {
      alert('Ошибка при создании закупки: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddRecommended = () => {
    alert('Функция "Добавить рекомендуемые товары" будет доступна в ближайшем обновлении');
  };

  const handleAddProducts = () => {
    // Сохраняем данные перед открытием каталога
    if (onFormDataChange) {
      onFormDataChange(formData);
    }
    onAddProducts();
  };

  const handleStepChange = (newStep) => {
    if (newStep === 2 && !formValid) {
      alert('Заполните обязательные поля на первом шаге');
      return;
    }
    
    // Сохраняем данные при смене шага
    if (onFormDataChange && newStep === 2) {
      onFormDataChange(formData);
    }
    
    setStep(newStep);
    if (onStepChange) {
      onStepChange(newStep);
    }
  };

  const handleCancel = () => {
    if (formData.title || formData.description || selectedProducts.length > 0) {
      const shouldSave = window.confirm('Сохранить введенные данные для продолжения позже?');
      if (!shouldSave && onClearSavedForm) {
        onClearSavedForm();
      }
    }
    onClose();
  };

  const handleClearForm = () => {
    const confirmClear = window.confirm('Очистить все введенные данные?');
    if (confirmClear) {
      setFormData({
        title: '',
        description: '',
        customer_name: currentUser?.company_name || '',
        customer_inn: currentUser?.INN || '',
        current_price: '',
        law_type: '44-ФЗ',
        contract_terms: '',
        location: currentUser?.location || '',
        start_date: '',
        end_date: ''
      });
      if (onClearSavedForm) {
        onClearSavedForm();
      }
    }
  };

  return (
    <div className="create-procurement">
      <div className="creation-steps">
        <div 
          className={`step-indicator ${step === 1 ? 'active' : ''}`}
          onClick={() => handleStepChange(1)}
          style={{cursor: 'pointer'}}
        >
          <span className="step-number">1</span>
          <span className="step-label">Основные параметры</span>
        </div>
        <div className="step-connector"></div>
        <div 
          className={`step-indicator ${step === 2 ? 'active' : ''}`}
          onClick={() => handleStepChange(2)}
          style={{cursor: 'pointer'}}
        >
          <span className="step-number">2</span>
          <span className="step-label">Выбор товаров</span>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        {step === 1 ? (
          // Шаг 1: Основные параметры
          <div className="step-content">
            <div className="form-section">              
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

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="law_type">Тип закупки</label>
                  <select
                    id="law_type"
                    name="law_type"
                    value={formData.law_type}
                    onChange={handleChange}
                  >
                    <option value="44-ФЗ">44-ФЗ</option>
                    <option value="223-ФЗ">223-ФЗ</option>
                    <option value="Коммерческая">Коммерческая</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="current_price">Ориентировочная цена, ₽</label>
                  <input
                    type="number"
                    id="current_price"
                    name="current_price"
                    value={formData.current_price}
                    onChange={handleChange}
                    placeholder="100000"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="customer_name">Название организации *</label>
                  <input
                    type="text"
                    id="customer_name"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleChange}
                    required
                    placeholder="Название вашей компании"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="customer_inn">ИНН *</label>
                  <input
                    type="text"
                    id="customer_inn"
                    name="customer_inn"
                    value={formData.customer_inn}
                    onChange={handleChange}
                    required
                    placeholder="1234567890"
                    maxLength="12"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="location">Регион поставки</label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Москва, Московская область"
                />
              </div>
            </div>

            <div className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="start_date">Дата начала</label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="end_date">Дата окончания</label>
                  <input
                    type="date"
                    id="end_date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleChange}
                    min={formData.start_date || new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-group">
                <label htmlFor="contract_terms">Условия поставки и оплаты</label>
                <textarea
                  id="contract_terms"
                  name="contract_terms"
                  value={formData.contract_terms}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Сроки поставки, условия оплаты, гарантийные обязательства..."
                />
              </div>
            </div>
          </div>
        ) : (
          // Шаг 2: Выбор товаров
          <div className="step-content">

            {/* Информация о закупке */}
            <div className="form-section">
              <h4>Информация о закупке</h4>
              <div className="procurement-summary">
                <p><strong>Название:</strong> {formData.title}</p>
                <p><strong>Заказчик:</strong> {formData.customer_name}</p>
                <p><strong>Тип закупки:</strong> {formData.law_type}</p>
                {formData.description && <p><strong>Описание:</strong> {formData.description}</p>}
                {formData.start_date && <p><strong>Дата начала:</strong> {formData.start_date}</p>}
                {formData.end_date && <p><strong>Дата окончания:</strong> {formData.end_date}</p>}
              </div>
            </div>

            {/* Секция с выбранными товарами */}
            {selectedProducts.length > 0 ? (
              <div className="form-section">
                <div className="section-header">
                  <h4>Выбранные товары ({selectedProducts.length})</h4>
                  <button 
                    type="button" 
                    className="btn-outline btn-small"
                    onClick={handleAddProducts}
                  >
                    Добавить еще
                  </button>
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
            ) : (
              <div className="empty-products-state">
                <div className="empty-icon">🛒</div>
                <h4>Товары не добавлены</h4>
                <p>Добавьте товары в закупку для продолжения</p>
              </div>
            )}

            {/* Кнопки действий для товаров */}
            <div className="products-actions">
              <button 
                type="button" 
                className="btn-outline btn-full"
                onClick={handleAddProducts}
              >
                📦 Выбрать товары из каталога
              </button>
              
              <button 
                type="button" 
                className="btn-outline btn-full"
                onClick={handleAddRecommended}
              >
                💡 Добавить рекомендуемые товары
              </button>
            </div>
          </div>
        )}

        <div className="form-actions">
          {step === 1 ? (
            <>
              <button 
                type="button" 
                className="btn-outline"
                onClick={handleClearForm}
              >
                Очистить форму
              </button>
              <button 
                type="button" 
                className="btn-outline"
                onClick={handleCancel}
              >
                Отмена
              </button>
              <button 
                type="button" 
                className="btn-primary"
                onClick={handleContinueToProducts}
                disabled={!formValid}
              >
                Продолжить → Выбор товаров
              </button>
            </>
          ) : (
            <>
              <button 
                type="button" 
                className="btn-outline"
                onClick={() => handleStepChange(1)}
              >
                ← Назад к параметрам
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading || selectedProducts.length === 0}
              >
                {loading ? 'Создание...' : `Создать закупку (${selectedProducts.length} товаров)`}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export default CreateProcurement;