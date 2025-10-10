// modal/CreateProcurement.jsx
import { useState } from 'react';
import './CreateProcurement.css';


function CreateProcurement({ onClose, onCreate, selectedProducts, onUpdateQuantity, onRemoveProduct }) {
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
    contract_security: ''
  });
  const [loading, setLoading] = useState(false);

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
      if (!formData.title || !formData.session_number) {
        alert('Заполните обязательные поля: название и номер сессии');
        return;
      }

      if (selectedProducts.length === 0) {
        alert('Добавьте хотя бы один товар в закупку');
        return;
      }

      const totalPrice = calculateTotalPrice();
      const procurementData = {
        ...formData,
        current_price: parseFloat(formData.current_price) || totalPrice,
        products: selectedProducts.map(product => ({
          product_id: product.id,
          required_quantity: product.quantity,
          max_price: product.price_per_item
        }))
      };

      await onCreate(procurementData);
    } catch (error) {
      alert('Ошибка при создании закупки: ' + error.message);
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
              <label htmlFor="session_number">Номер котировочной сессии *</label>
              <input
                type="text"
                id="session_number"
                name="session_number"
                value={formData.session_number}
                onChange={handleChange}
                required
                placeholder="Например: 10055209"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="current_price">Начальная цена, ₽</label>
              <input
                type="number"
                id="current_price"
                name="current_price"
                value={formData.current_price}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder={formatPrice(calculateTotalPrice())}
              />
              <small className="hint">Оставьте пустым для автоматического расчета ({formatPrice(calculateTotalPrice())} ₽)</small>
            </div>
            
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
          </div>

          <div className="form-group">
            <label htmlFor="description">Описание закупки</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Подробное описание требований и условий закупки..."
            />
          </div>
        </div>

        <div className="form-section">
          <h4>Информация о заказчике</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="customer_name">Наименование заказчика *</label>
              <input
                type="text"
                id="customer_name"
                name="customer_name"
                value={formData.customer_name}
                onChange={handleChange}
                required
                placeholder="ООО 'Компания'"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="customer_inn">ИНН заказчика</label>
              <input
                type="text"
                id="customer_inn"
                name="customer_inn"
                value={formData.customer_inn}
                onChange={handleChange}
                placeholder="1234567890"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Сроки проведения</h4>
          
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
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Дополнительные условия</h4>
          
          <div className="form-group">
            <label htmlFor="contract_terms">Условия исполнения контракта</label>
            <textarea
              id="contract_terms"
              name="contract_terms"
              value={formData.contract_terms}
              onChange={handleChange}
              rows="2"
              placeholder="Сроки поставки, гарантийные обязательства, условия оплаты..."
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
              placeholder="Размер обеспечения, срок предоставления..."
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
            disabled={loading || selectedProducts.length === 0}
          >
            {loading ? 'Создание...' : `Создать закупку (${selectedProducts.length} товаров)`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateProcurement;