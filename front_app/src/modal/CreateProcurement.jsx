/* eslint-disable no-unused-vars */
// modal/CreateProcurement.jsx
import { useState, useEffect } from 'react';
import { draftsAPI } from '../services/api';
import './CreateProcurement.css';

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

  const handleFormChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    if (onFormDataChange) {
      onFormDataChange(newFormData);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const calculateTotal = () => {
    return selectedProducts.reduce((sum, product) => 
      sum + (product.price_per_item * product.quantity), 0
    );
  };

  return (
    <div className="create-procurement">
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

          <div className="form-group">
            <label>Тип закупки</label>
            <select
              value={formData.law_type}
              onChange={(e) => handleFormChange('law_type', e.target.value)}
            >
              <option value="44-ФЗ">44-ФЗ</option>
              <option value="223-ФЗ">223-ФЗ</option>
              <option value="Коммерческая">Коммерческая</option>
            </select>
          </div>

          <div className="form-group">
            <label>Условия контракта</label>
            <textarea
              value={formData.contract_terms}
              onChange={(e) => handleFormChange('contract_terms', e.target.value)}
              placeholder="Условия поставки, оплаты и другие требования"
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Место поставки</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleFormChange('location', e.target.value)}
                placeholder="Город, адрес"
              />
            </div>
            <div className="form-group">
              <label>Срок действия закупки</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => handleFormChange('end_date', e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-outline"
              onClick={onClose}
            >
              Отмена
            </button>
            
            <button 
              type="button" 
              className="btn-outline"
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
                <div className="products-total">
                  <strong>Общая сумма: {formatPrice(calculateTotal())} ₽</strong>
                </div>
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
            
            <button 
              type="button" 
              className="btn-outline"
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
              <p><strong>Тип закупки:</strong> {formData.law_type}</p>
              <p><strong>Ориентировочная стоимость:</strong> {formatPrice(formData.current_price)} ₽</p>
              <p><strong>Место поставки:</strong> {formData.location || 'Не указано'}</p>
              <p><strong>Срок действия:</strong> {formData.end_date || 'Не указан'}</p>
            </div>
          </div>

          <div className="products-summary">
            <h4>Товары в закупке ({selectedProducts.length})</h4>
            <div className="products-list">
              {selectedProducts.map(product => (
                <div key={product.id} className="product-item">
                  <span className="product-name">{product.name}</span>
                  <span className="product-quantity">{product.quantity} шт.</span>
                  <span className="product-price">{formatPrice(product.price_per_item)} ₽/шт</span>
                  <span className="product-total">{formatPrice(product.price_per_item * product.quantity)} ₽</span>
                </div>
              ))}
            </div>
            <div className="summary-total">
              <strong>Общая сумма: {formatPrice(calculateTotal())} ₽</strong>
            </div>
          </div>

          {formData.contract_terms && (
            <div className="contract-terms">
              <h4>Условия контракта</h4>
              <p>{formData.contract_terms}</p>
            </div>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-outline"
              onClick={() => onStepChange(2)}
            >
              ← Назад
            </button>
            
            <button 
              type="button" 
              className="btn-outline"
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