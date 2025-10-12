/* eslint-disable no-unused-vars */
// components/FiltersSidebar.jsx
import { useState, useEffect } from 'react';
import './FiltersSidebar.css';

function FiltersSidebar({ 
  activeSection, 
  onFiltersChange,
  products = [],
  procurements = [] 
}) {
  const [filters, setFilters] = useState({
    categories: [],
    priceRange: { min: '', max: '' },
    procurementStatus: ['active', 'soon'],
    manufacturers: [],
    inStock: false
  });

  // Получаем уникальные категории из товаров
  const availableCategories = [...new Set(products
    .filter(p => p && p.category_name)
    .map(p => p.category_name)
  )].sort();

  // Получаем уникальных производителей
  const availableManufacturers = [...new Set(products
    .filter(p => p && p.company)
    .map(p => p.company)
  )].sort();

  // Получаем реальные статусы из закупок
  const availableStatuses = [...new Set(procurements
    .filter(p => p && p.status)
    .map(p => p.status)
  )];

  // Применяем фильтры при изменении
  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const handleCategoryChange = (category) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleManufacturerChange = (manufacturer) => {
    setFilters(prev => ({
      ...prev,
      manufacturers: prev.manufacturers.includes(manufacturer)
        ? prev.manufacturers.filter(m => m !== manufacturer)
        : [...prev.manufacturers, manufacturer]
    }));
  };

  const handlePriceChange = (field, value) => {
    const newValue = value === '' ? '' : Math.max(0, parseInt(value) || 0);
    setFilters(prev => ({
      ...prev,
      priceRange: { ...prev.priceRange, [field]: newValue }
    }));
  };

  const handleStatusChange = (status) => {
    setFilters(prev => ({
      ...prev,
      procurementStatus: prev.procurementStatus.includes(status)
        ? prev.procurementStatus.filter(s => s !== status)
        : [...prev.procurementStatus, status]
    }));
  };

  const handleStockChange = (inStock) => {
    setFilters(prev => ({ ...prev, inStock }));
  };

  const clearFilters = () => {
    const clearedFilters = {
      categories: [],
      priceRange: { min: '', max: '' },
      procurementStatus: ['active', 'soon'],
      manufacturers: [],
      inStock: false
    };
    setFilters(clearedFilters);
  };

  // Считаем количество активных фильтров
  const activeFiltersCount = 
    filters.categories.length +
    (filters.priceRange.min ? 1 : 0) +
    (filters.priceRange.max ? 1 : 0) +
    filters.manufacturers.length +
    (filters.inStock ? 1 : 0) +
    (filters.procurementStatus.length > 0 ? 1 : 0);

  return (
    <aside className="filters-sidebar">
      <div className="filters-header">
        <h3>Фильтры</h3>
        <div className="filters-header-actions">
          {activeFiltersCount > 0 && (
            <span className="active-filters-count">{activeFiltersCount}</span>
          )}
          <button className="clear-filters-btn" onClick={clearFilters}>
            Очистить
          </button>
        </div>
      </div>
      
      {activeSection === 'products' ? (
        <>
          {/* Фильтр по категориям */}
          {availableCategories.length > 0 && (
            <div className="filters-section">
              <h4>Категории</h4>
              <div className="filter-options">
                {availableCategories.slice(0, 10).map(category => (
                  <label key={category} className="filter-option">
                    <input 
                      type="checkbox" 
                      checked={filters.categories.includes(category)}
                      onChange={() => handleCategoryChange(category)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-text">{category}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Фильтр по производителям */}
          {availableManufacturers.length > 0 && (
            <div className="filters-section">
              <h4>Производители</h4>
              <div className="filter-options">
                {availableManufacturers.slice(0, 10).map(manufacturer => (
                  <label key={manufacturer} className="filter-option">
                    <input 
                      type="checkbox" 
                      checked={filters.manufacturers.includes(manufacturer)}
                      onChange={() => handleManufacturerChange(manufacturer)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-text">{manufacturer}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Фильтр по цене */}
          <div className="filters-section">
            <h4>Цена, ₽</h4>
            <div className="price-range">
              <div className="price-inputs">
                <div className="price-input-group">
                  <label>От</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    className="price-input"
                    value={filters.priceRange.min}
                    onChange={(e) => handlePriceChange('min', e.target.value)}
                    min="0"
                  />
                </div>
                <div className="price-input-group">
                  <label>До</label>
                  <input 
                    type="number" 
                    placeholder="100000" 
                    className="price-input"
                    value={filters.priceRange.max}
                    onChange={(e) => handlePriceChange('max', e.target.value)}
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Фильтр по наличию */}
          <div className="filters-section">
            <label className="filter-option single-option">
              <input 
                type="checkbox" 
                checked={filters.inStock}
                onChange={(e) => handleStockChange(e.target.checked)}
              />
              <span className="checkmark"></span>
              <span className="option-text">Только в наличии</span>
            </label>
          </div>
        </>
      ) : (
        <>
          {/* Фильтры для закупок */}
          <div className="filters-section">
            <h4>Статус закупки</h4>
            <div className="filter-options">
              {['active', 'soon', 'completed'].map(status => {
                const statusText = {
                  'active': 'Активные',
                  'soon': 'Скоро начнутся', 
                  'completed': 'Завершенные'
                }[status] || status;
                
                return (
                  <label key={status} className="filter-option">
                    <input 
                      type="checkbox" 
                      checked={filters.procurementStatus.includes(status)}
                      onChange={() => handleStatusChange(status)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-text">{statusText}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export default FiltersSidebar;