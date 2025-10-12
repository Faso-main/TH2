/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// modal/CreateProcurement.jsx
import { useState, useEffect } from 'react';
import './CreateProcurement.css';
import { draftsAPI } from '../services/api';


// В компонент CreateProcurement добавить кнопку сохранения черновика

function CreateProcurement({ 
  onAddProduct, 
  onClose, 
  onCreate, 
  selectedProducts, 
  onUpdateQuantity, 
  onRemoveProduct, 
  onAddProducts,
  currentUser,
  step,
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
    end_date: '',
    ...initialFormData
  });

  const [saveDraftLoading, setSaveDraftLoading] = useState(false);

  // Функция для сохранения черновика
  const handleSaveDraft = async () => {
    try {
      setSaveDraftLoading(true);
      
      const draftData = {
        title: formData.title || 'Новый черновик закупки',
        description: formData.description,
        customer_name: formData.customer_name,
        customer_inn: formData.customer_inn,
        current_price: parseFloat(formData.current_price) || 0,
        law_type: formData.law_type,
        contract_terms: formData.contract_terms,
        location: formData.location,
        start_date: formData.start_date,
        end_date: formData.end_date,
        products: selectedProducts,
        step: step
      };

      await draftsAPI.saveDraft(draftData);
      
      // Очищаем сохраненные данные формы
      if (onClearSavedForm) {
        onClearSavedForm();
      }
      
      alert('Черновик успешно сохранен!');
      onClose();
      
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Ошибка при сохранении черновика: ' + error.message);
    } finally {
      setSaveDraftLoading(false);
    }
  };

  // Функция для автоматического сохранения при изменении формы
  const handleFormChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    // Автосохранение данных формы
    if (onFormDataChange) {
      onFormDataChange(newFormData);
    }
  };

  // В JSX добавить кнопку сохранения черновика
  return (
    <div className="create-procurement">
      {/* Шаги создания закупки */}
      <div className="procurement-steps">
        <div className={`step ${step === 1 ? 'active' : ''}`}>
          <span>1</span>
          <span>Основная информация</span>
        </div>
        <div className={`step ${step === 2 ? 'active' : ''}`}>
          <span>2</span>
          <span>Выбор товаров</span>
        </div>
        <div className={`step ${step === 3 ? 'active' : ''}`}>
          <span>3</span>
          <span>Подтверждение</span>
        </div>
      </div>

      {step === 1 && (
        <div className="procurement-form">
          <h3>Основная информация о закупке</h3>
          
          <div className="form-group">
            <label>Название закупки *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
              placeholder="Введите название закупки"
              required
            />
          </div>

          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Опишите детали закупки"
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Заказчик *</label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => handleFormChange('customer_name', e.target.value)}
                placeholder="Название организации"
                required
              />
            </div>
            <div className="form-group">
              <label>ИНН заказчика *</label>
              <input
                type="text"
                value={formData.customer_inn}
                onChange={(e) => handleFormChange('customer_inn', e.target.value)}
                placeholder="10 или 12 цифр"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Ориентировочная стоимость *</label>
            <input
              type="number"
              value={formData.current_price}
              onChange={(e) => handleFormChange('current_price', e.target.value)}
              placeholder="Введите сумму в рублях"
              required
            />
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-outline"
              onClick={onClose}
            >
              Отмена
            </button>
            
            {/* Кнопка сохранения черновика */}
            <button 
              type="button" 
              className="btn-secondary"
              onClick={handleSaveDraft}
              disabled={saveDraftLoading}
            >
              {saveDraftLoading ? 'Сохранение...' : 'Сохранить черновик'}
            </button>
            
            <button 
              type="button" 
              className="btn-primary"
              onClick={() => onStepChange(2)}
              disabled={!formData.title || !formData.customer_name || !formData.current_price}
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="products-selection">
          <h3>Выбор товаров для закупки</h3>
          
          <div className="selection-actions">
            <button 
              className="btn-outline"
              onClick={() => onStepChange(1)}
            >
              ← Назад
            </button>
            <button 
              className="btn-primary"
              onClick={onAddProducts}
            >
              Добавить товары
            </button>
          </div>

          {/* Список выбранных товаров */}
          <div className="selected-products">
            <h4>Выбранные товары ({selectedProducts.length})</h4>
            {selectedProducts.length === 0 ? (
              <div className="empty-selection">
                <p>Товары не выбраны</p>
                <button 
                  className="btn-outline"
                  onClick={onAddProducts}
                >
                  Выбрать товары
                </button>
              </div>
            ) : (
              <div className="products-list">
                {selectedProducts.map(product => (
                  <div key={product.id} className="selected-product">
                    <div className="product-info">
                      <span className="product-name">{product.name}</span>
                      <span className="product-category">{product.category_name}</span>
                    </div>
                    <div className="product-controls">
                      <div className="quantity-controls">
                        <button 
                          onClick={() => onUpdateQuantity(product.id, product.quantity - 1)}
                          disabled={product.quantity <= 1}
                        >
                          -
                        </button>
                        <span>{product.quantity} шт.</span>
                        <button 
                          onClick={() => onUpdateQuantity(product.id, product.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <span className="product-price">
                        {formatPrice(product.price_per_item * product.quantity)} ₽
                      </span>
                      <button 
                        className="remove-btn"
                        onClick={() => onRemoveProduct(product.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-outline"
              onClick={onClose}
            >
              Отмена
            </button>
            
            {/* Кнопка сохранения черновика на шаге 2 */}
            <button 
              type="button" 
              className="btn-secondary"
              onClick={handleSaveDraft}
              disabled={saveDraftLoading}
            >
              {saveDraftLoading ? 'Сохранение...' : 'Сохранить черновик'}
            </button>
            
            <button 
              type="button" 
              className="btn-primary"
              onClick={() => onStepChange(3)}
              disabled={selectedProducts.length === 0}
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="confirmation">
          <h3>Подтверждение закупки</h3>
          
          <div className="procurement-summary">
            <h4>Информация о закупке</h4>
            <div className="summary-details">
              <p><strong>Название:</strong> {formData.title}</p>
              <p><strong>Заказчик:</strong> {formData.customer_name}</p>
              <p><strong>ИНН:</strong> {formData.customer_inn}</p>
              <p><strong>Стоимость:</strong> {formatPrice(formData.current_price)} ₽</p>
              <p><strong>Товаров:</strong> {selectedProducts.length} позиций</p>
              <p><strong>Общая сумма:</strong> {formatPrice(selectedProducts.reduce((sum, product) => 
                sum + (product.price_per_item * product.quantity), 0))} ₽</p>
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-outline"
              onClick={() => onStepChange(2)}
            >
              ← Назад
            </button>
            
            {/* Кнопка сохранения черновика на шаге 3 */}
            <button 
              type="button" 
              className="btn-secondary"
              onClick={handleSaveDraft}
              disabled={saveDraftLoading}
            >
              {saveDraftLoading ? 'Сохранение...' : 'Сохранить черновик'}
            </button>
            
            <button 
              type="button" 
              className="btn-primary"
              onClick={() => onCreate(formData)}
            >
              Создать закупку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateProcurement;