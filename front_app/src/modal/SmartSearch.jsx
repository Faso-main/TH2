// components/SmartSearch.jsx
import { useState, useEffect, useRef } from 'react';
import { searchAPI } from '../services/api';
import './SmartSearch.css';

function SmartSearch({ onSearch, onSelect, placeholder = "Умный поиск товаров и закупок..." }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [popularSearches, setPopularSearches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  // Загружаем популярные запросы при монтировании
  useEffect(() => {
    loadPopularSearches();
  }, []);

  const loadPopularSearches = async () => {
    try {
      const data = await searchAPI.popularSearches();
      setPopularSearches(data.popular_searches || []);
    } catch (error) {
      console.error('Error loading popular searches:', error);
    }
  };

  // Обработчик изменения запроса
  const handleQueryChange = async (newQuery) => {
    setQuery(newQuery);
    
    if (newQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(true);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchAPI.autocomplete(newQuery);
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Выбор подсказки
  const handleSuggestionSelect = (suggestion) => {
    setQuery(suggestion.title);
    setShowSuggestions(false);
    
    if (onSelect) {
      onSelect(suggestion);
    }
    
    // Если есть поисковый обработчик, запускаем поиск
    if (onSearch) {
      onSearch(suggestion.title);
    }
  };

  // Запуск поиска
  const handleSearch = (searchQuery = query) => {
    if (!searchQuery.trim()) return;
    
    setShowSuggestions(false);
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  // Обработчик клавиш
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Очистка поиска
  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    if (onSearch) {
      onSearch('');
    }
  };

  return (
    <div className="smart-search-container">
      <div className="smart-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="smart-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => setShowSuggestions(true)}
        />
        
        {/* Кнопки действия */}
        <div className="search-actions">
          {query && (
            <button 
              className="clear-search-btn"
              onClick={handleClear}
              title="Очистить поиск"
            >
              ✕
            </button>
          )}
          <button 
            className="search-submit-btn"
            onClick={() => handleSearch()}
            disabled={!query.trim() || isLoading}
            title="Найти"
          >
            {isLoading ? '⌛' : '🔍'}
          </button>
        </div>

        {/* Выпадающие подсказки */}
        {showSuggestions && (
          <div className="suggestions-dropdown">
            {/* Подсказки автодополнения */}
            {suggestions.length > 0 && (
              <div className="suggestions-section">
                <div className="suggestions-header">Подсказки</div>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion.type}-${suggestion.id}-${index}`}
                    className="suggestion-item"
                    onClick={() => handleSuggestionSelect(suggestion)}
                  >
                    <div className="suggestion-content">
                      <span className="suggestion-text">{suggestion.title}</span>
                      <span className="suggestion-meta">
                        {suggestion.category_name && (
                          <span className="suggestion-category">
                            {suggestion.category_name}
                          </span>
                        )}
                        {suggestion.price && (
                          <span className="suggestion-price">
                            {new Intl.NumberFormat('ru-RU').format(suggestion.price)} ₽
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="suggestion-type">{suggestion.type}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Популярные запросы */}
            {suggestions.length === 0 && popularSearches.length > 0 && (
              <div className="suggestions-section">
                <div className="suggestions-header">Популярные запросы</div>
                {popularSearches.map((search, index) => (
                  <div
                    key={`popular-${index}`}
                    className="suggestion-item popular-search"
                    onClick={() => handleSuggestionSelect({ title: search })}
                  >
                    <div className="suggestion-content">
                      <span className="suggestion-text">{search}</span>
                      <span className="suggestion-meta">
                        <span className="popular-badge">Популярно</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Сообщение при отсутствии результатов */}
            {suggestions.length === 0 && popularSearches.length === 0 && query.length >= 2 && (
              <div className="no-suggestions">
                Ничего не найдено. Попробуйте изменить запрос.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SmartSearch;