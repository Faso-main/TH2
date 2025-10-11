/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import './App.css';
import './Body.css';
import './Header.css';
import Modal from './modal/Modal';
import LoginForm from './modal/LoginForm';
import RegisterForm from './modal/RegisterForm';
import UserProfile from './modal/UserProfile';
import CreateProcurement from './modal/CreateProcurement';
import { authAPI, productsAPI, procurementsAPI } from './services/api';
import { generateProductImage, getCategoryColor } from './utils/productImages';

function App() {
  const [savedProcurementFormData, setSavedProcurementFormData] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [procurements, setProcurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ products: [], procurements: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [procurementCreationStep, setProcurementCreationStep] = useState(1);
  const [activeSection, setActiveSection] = useState('products');
  const [highlightAddToProcurement, setHighlightAddToProcurement] = useState(false);
  const [savedProcurementData, setSavedProcurementData] = useState(null);

  // Загрузка данных при старте
  useEffect(() => {
    const user = authAPI.getCurrentUser();
    if (user && authAPI.isAuthenticated()) {
      setCurrentUser(user);
    }
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      const testProducts = [
        {
          id: 'prod-1',
          name: 'Смартфон Apple iPhone 15 Pro',
          category_name: 'Электроника',
          price_per_item: 89999,
          amount: 10,
          company: 'Apple'
        },
        {
          id: 'prod-2',
          name: 'Ноутбук Dell XPS 13',
          category_name: 'Компьютеры',
          price_per_item: 129999,
          amount: 5,
          company: 'Dell'
        }
      ];

      const testProcurements = [
        {
          id: 'PROC-12345',
          title: 'Оказание услуг по проведению специальной оценки условий труда',
          status: 'active',
          current_price: 92500,
          description: 'Закупка услуг по специальной оценке условий труда для образовательного учреждения',
          customer_name: '«Школа № 1811 «Восточное Измайлово»',
          customer_inn: '7719894832',
          procurement_date: '2024-01-15T00:00:00Z',
          participants_count: 7,
          products: []
        }
      ];

      try {
        const [productsResponse, procurementsResponse] = await Promise.all([
          productsAPI.getProducts({ limit: 20 }),
          procurementsAPI.getProcurements({ limit: 10 })
        ]);
        
        setProducts(productsResponse.products || testProducts);
        setProcurements(procurementsResponse.procurements || testProcurements);
      } catch (apiError) {
        console.warn('API недоступно, используем тестовые данные');
        setProducts(testProducts);
        setProcurements(testProcurements);
      }

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Функции для работы с модальными окнами
  const openModal = (modalName) => {
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
    setAuthMode('login');
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
  };

  // Функции авторизации
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    closeModal();
    setTimeout(() => {
      alert(`Добро пожаловать, ${user.name}!`);
    }, 100);
  };

  const handleRegisterSuccess = (user) => {
    setCurrentUser(user);
    closeModal();
    setTimeout(() => {
      alert(`Регистрация успешна! Добро пожаловать, ${user.name}!`);
    }, 100);
  };

  const handleLogout = async () => {
    try {
      setAuthLoading(true);
      await authAPI.logout();
      setCurrentUser(null);
      clearSelectedProducts();
      alert('Вы успешно вышли из системы');
    } catch (error) {
      console.error('Logout error:', error);
      setCurrentUser(null);
      clearSelectedProducts();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUserProfileClick = () => {
    if (currentUser) {
      openModal('profile');
    } else {
      openModal('auth');
    }
  };

  // Функции для работы с товарами
  const handleAddToProcurement = (product) => {
    if (!currentUser) {
      openModal('auth');
      return;
    }

    setSelectedProducts(prev => {
      const existingProduct = prev.find(p => p.id === product.id);
      if (existingProduct) {
        return prev.map(p => 
          p.id === product.id 
            ? { ...p, quantity: (p.quantity || 1) + 1 }
            : p
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    // Показываем уведомление о добавлении
    showNotification(`Товар "${product.name}" добавлен в закупку`, 'success');
  };

  const handleRemoveFromProcurement = (productId) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  const handleUpdateQuantity = (productId, quantity) => {
    if (quantity < 1) {
      handleRemoveFromProcurement(productId);
      return;
    }
    
    setSelectedProducts(prev => 
      prev.map(p => p.id === productId ? { ...p, quantity } : p)
    );
  };

  const clearSelectedProducts = () => {
    setSelectedProducts([]);
  };

  // Функции для работы с закупками
  const handleCreateProcurement = async (procurementData) => {
    try {
      console.log('Creating procurement:', procurementData);
      
      const procurementWithProducts = {
        ...procurementData,
        products: selectedProducts.map(product => ({
          product_id: product.id,
          required_quantity: product.quantity,
          max_price: product.price_per_item
        }))
      };

      const response = await procurementsAPI.create(procurementWithProducts);
      
      setProcurements(prev => [response.procurement, ...prev]);
      clearSelectedProducts();
      setHighlightAddToProcurement(false);
      setSavedProcurementData(null);
      
      closeModal();
      
      showNotification('Закупка успешно создана!', 'success');
      
      return response;
      
    } catch (error) {
      console.error('Create procurement error:', error);
      throw new Error(error.message || 'Ошибка при создании закупки');
    }
  };

  const handleParticipate = async (procurementId, proposedPrice) => {
    if (!currentUser) {
      openModal('auth');
      return;
    }

    try {
      await procurementsAPI.participate(procurementId, {
        proposed_price: proposedPrice,
        proposal_text: `Готов поставить товары по цене ${proposedPrice} ₽`
      });
      showNotification('Заявка на участие отправлена!', 'success');
      const response = await procurementsAPI.getProcurements();
      setProcurements(response.procurements);
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
    }
  };

  // Функции для переключения между созданием закупки и выбором товаров
  const handleAddProducts = () => {
    setSavedProcurementData({
      hasUnsavedData: true,
      timestamp: new Date().toISOString()
    });

    setActiveModal(null);
    setHighlightAddToProcurement(true);
    setActiveSection('products');
    
    showNotification('🎯 Выбирайте товары кнопкой "В закупку". Вернитесь к созданию закупки, когда закончите.', 'info');
  };

  const handleReturnToProcurement = () => {
    setHighlightAddToProcurement(false);
    setProcurementCreationStep(2);
    setActiveModal('create-procurement');
    
    showNotification(`📋 Продолжайте создание закупки. Выбрано товаров: ${selectedProducts.length}`, 'info');
  };

const handleOpenCreateProcurement = () => {
  setProcurementCreationStep(1);
  // Не очищаем savedProcurementData, чтобы сохранить данные
  openModal('create-procurement');
};

const handleCloseCreateProcurement = () => {
  // При закрытии модалки спрашиваем, сохранять ли данные
  if (savedProcurementFormData && savedProcurementFormData.hasUnsavedData) {
    const shouldSave = window.confirm('Сохранить введенные данные для продолжения позже?');
    if (!shouldSave) {
      setSavedProcurementFormData(null);
    }
  } else {
    setSavedProcurementFormData(null);
  }
  setProcurementCreationStep(1);
  closeModal();
};

const handleSaveProcurementFormData = (formData) => {
  setSavedProcurementFormData({
    hasUnsavedData: true,
    formData: formData,
    timestamp: new Date().toISOString()
  });
};

// Добавьте функцию для очистки сохраненных данных:
const handleClearSavedProcurementData = () => {
  setSavedProcurementFormData(null);
};

  // Функции поиска
  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults({ products: [], procurements: [] });
      return;
    }

    setIsSearching(true);
    
    try {
      const searchLower = query.toLowerCase().trim();
      
      const foundProducts = products.filter(product => 
        product.name.toLowerCase().includes(searchLower) ||
        product.category_name?.toLowerCase().includes(searchLower) ||
        product.company?.toLowerCase().includes(searchLower) ||
        product.description?.toLowerCase().includes(searchLower)
      );

      const foundProcurements = procurements.filter(procurement =>
        procurement.title.toLowerCase().includes(searchLower) ||
        procurement.description?.toLowerCase().includes(searchLower) ||
        procurement.customer_name?.toLowerCase().includes(searchLower) ||
        procurement.session_number?.toLowerCase().includes(searchLower)
      );

      setSearchResults({
        products: foundProducts,
        procurements: foundProcurements
      });
      
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({ products: [], procurements: [] });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (query) => {
    setSearchQuery(query);
    handleSearch(query);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ products: [], procurements: [] });
  };

  // Вспомогательные функции
  const showNotification = (message, type = 'info') => {
    // Простая реализация уведомлений
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const getDisplayProducts = () => {
    return searchQuery ? searchResults.products : products;
  };

  const getDisplayProcurements = () => {
    return searchQuery ? searchResults.procurements : procurements;
  };

  return (
    <div className="app">
      <Header 
        currentUser={currentUser}
        onLogout={handleLogout}
        onUserProfileClick={handleUserProfileClick}
        onCreateProcurement={handleOpenCreateProcurement}
        authLoading={authLoading}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onClearSearch={clearSearch}
        isSearching={isSearching}
        selectedProductsCount={selectedProducts.length}
      />
      
      <Main 
        products={getDisplayProducts()}
        procurements={getDisplayProcurements()}
        loading={loading}
        currentUser={currentUser}
        onParticipate={handleParticipate}
        onOpenAuth={() => openModal('auth')}
        searchQuery={searchQuery}
        isSearching={isSearching}
        onAddToProcurement={handleAddToProcurement}
        selectedProducts={selectedProducts}
        highlightAddToProcurement={highlightAddToProcurement}
        onReturnToProcurement={handleReturnToProcurement}
        savedProcurementData={savedProcurementData}
        savedProcurementFormData={savedProcurementFormData}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        // Добавьте эти пропсы:
        setProcurementCreationStep={setProcurementCreationStep}
        setActiveModal={setActiveModal}
      />
      
      <Footer />

      {/* Модальные окна */}
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
            onLoginSuccess={handleLoginSuccess}
          />
        ) : (
          <RegisterForm 
            onClose={closeModal}
            onSwitchToLogin={() => switchAuthMode('login')}
            onRegisterSuccess={handleRegisterSuccess}
          />
        )}
      </Modal>

      <Modal
        isOpen={activeModal === 'create-procurement'}
        onClose={handleCloseCreateProcurement}
        title={procurementCreationStep === 1 ? "Создание закупки" : "Выбор товаров"}
        size="large"
      >
        <CreateProcurement 
          onClose={handleCloseCreateProcurement}
          onCreate={handleCreateProcurement}
          selectedProducts={selectedProducts}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveProduct={handleRemoveFromProcurement}
          onAddProducts={handleAddProducts}
          currentUser={currentUser}
          step={procurementCreationStep}
          onStepChange={setProcurementCreationStep}
          initialFormData={savedProcurementFormData?.formData}
          onFormDataChange={handleSaveProcurementFormData}
          onClearSavedForm={handleClearSavedProcurementData}
        />
      </Modal>

      <Modal
        isOpen={activeModal === 'profile'}
        onClose={closeModal}
        title="Личный кабинет"
        size="large"
      >
        <UserProfile 
          user={currentUser} 
          onClose={closeModal}
        />
      </Modal>
    </div>
  );
}

// Компонент Header
function Header({ 
  currentUser, 
  onLogout, 
  onUserProfileClick, 
  onCreateProcurement, 
  authLoading,
  searchQuery,
  onSearchChange,
  onClearSearch,
  isSearching,
  selectedProductsCount
}) {
  const handleSearchSubmit = (e) => {
    e.preventDefault();
  };

  const handleInputChange = (e) => {
    onSearchChange(e.target.value);
  };

  const handleClearClick = () => {
    onClearSearch();
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <h1>SpeedOfLight</h1>
        </div>
        
        <div className="header-search">
          <form className={`search-bar ${isSearching ? 'searching' : ''}`} onSubmit={handleSearchSubmit}>
            <input 
              type="text" 
              placeholder="Поиск товаров и закупок..." 
              className="search-input"
              value={searchQuery}
              onChange={handleInputChange}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearchSubmit(e);
                }
              }}
            />
            
            {searchQuery && (
              <button 
                type="button"
                className="clear-search-btn"
                onClick={handleClearClick}
                title="Очистить поиск"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
            
            <button type="submit" className="search-btn" disabled={isSearching}>
              {isSearching ? (
                <div className="loading-spinner-small"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.3-4.3"></path>
                </svg>
              )}
            </button>
          </form>
        </div>

        <div className="header-actions">
          {currentUser && (
            <button 
              className={`user-icon-btn create-procurement-btn ${selectedProductsCount > 0 ? 'has-products' : ''}`}
              onClick={onCreateProcurement}
              title="Создать закупку"
            >
              <svg 
                width="35"
                height="35" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              {selectedProductsCount > 0 && (
                <span className="selected-products-badge">{selectedProductsCount}</span>
              )}
            </button>
          )}

          <button 
            className={`user-icon-btn ${currentUser ? 'user-authenticated' : ''}`} 
            onClick={onUserProfileClick} 
            title={currentUser ? 'Личный кабинет' : 'Войти'}
            disabled={authLoading}
          >
            <svg 
              width="35"
              height="35" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>

          {currentUser && (
            <button 
              className="user-icon-btn logout-btn" 
              onClick={onLogout} 
              title="Выйти"
              disabled={authLoading}
            >
              {authLoading ? (
                <div className="loading-spinner-small"></div>
              ) : (
                <svg 
                  width="35"
                  height="35" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// Компонент Main
function Main({ 
  products, 
  procurements, 
  loading, 
  currentUser, 
  onParticipate, 
  onOpenAuth,
  searchQuery,
  isSearching,
  onAddToProcurement,
  selectedProducts,
  highlightAddToProcurement,
  onReturnToProcurement,
  savedProcurementData,
  activeSection,
  setActiveSection,
  savedProcurementFormData,
  // Добавьте эти пропсы:
  setProcurementCreationStep,
  setActiveModal
}) {
  const [filteredProducts, setFilteredProducts] = useState(products);
  const [filteredProcurements, setFilteredProcurements] = useState(procurements);

  useEffect(() => {
    setFilteredProducts(products);
  }, [products]);

  useEffect(() => {
    setFilteredProcurements(procurements);
  }, [procurements]);

  const getDisplayProducts = () => {
    return searchQuery ? filteredProducts.filter(product => 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) : filteredProducts;
  };

  const getDisplayProcurements = () => {
    return searchQuery ? filteredProcurements.filter(procurement =>
      procurement.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      procurement.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      procurement.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      procurement.session_number?.toLowerCase().includes(searchQuery.toLowerCase())
    ) : filteredProcurements;
  };

  if (loading) {
    return (
      <main className="main">
        <div className="products-container">
          <div className="loading">Загрузка...</div>
        </div>
      </main>
    );
  }

  const displayProducts = getDisplayProducts();
  const displayProcurements = getDisplayProcurements();

  return (
    <main className="main">
<div className="products-container">
  {/* Универсальный баннер для сохраненной закупки */}
  {savedProcurementFormData && (
    <div className="saved-data-banner">
      <div className="banner-content">
        <div className="banner-info">
          <div>
            <div className="banner-subtitle">
              {selectedProducts.length > 0 
                ? `Выбрано товаров: ${selectedProducts.length}` 
                : 'Готово к выбору товаров'
              }
              {savedProcurementFormData.formData?.customer_name && 
                ` • ${savedProcurementFormData.formData.customer_name}`
              }
            </div>
          </div>
        </div>
        <button 
          className="btn-primary"
          onClick={() => {
            // Всегда открываем шаг 2 (выбор товаров)
            setProcurementCreationStep(2);
            setActiveModal('create-procurement');
          }}
        >
          Продолжить создание
        </button>
      </div>
    </div>
  )}

        <div className="products-layout">
          <section className="products-main">
            <div className="products-header">
              <div className="section-buttons">
                <button 
                  className={`section-btn ${activeSection === 'products' ? 'active' : ''}`}
                  onClick={() => setActiveSection('products')}
                >
                  Товары
                </button>
                <button 
                  className={`section-btn ${activeSection === 'procurements' ? 'active' : ''}`}
                  onClick={() => setActiveSection('procurements')}
                >
                  Закупки
                </button>
              </div>
              <div className="search-info">
                {searchQuery && (
                  <span className="search-results-count">
                    {activeSection === 'products' 
                      ? `Найдено товаров: ${displayProducts.length}` 
                      : `Найдено закупок: ${displayProcurements.length}`
                    }
                    {isSearching && ' (поиск...)'}
                  </span>
                )}
                {!searchQuery && (
                  <span className="products-count">
                    {activeSection === 'products' 
                      ? `Всего товаров: ${displayProducts.length}` 
                      : `Всего закупок: ${displayProcurements.length}`
                    }
                  </span>
                )}
              </div>
            </div>
            
            {activeSection === 'products' ? (
              <ProductsGrid 
                products={displayProducts} 
                searchQuery={searchQuery}
                isSearching={isSearching}
                onAddToProcurement={onAddToProcurement}
                highlightAddToProcurement={highlightAddToProcurement}
              />
            ) : (
              <ProcurementsGrid 
                procurements={displayProcurements}
                currentUser={currentUser}
                onParticipate={onParticipate}
                onOpenAuth={onOpenAuth}
                searchQuery={searchQuery}
                isSearching={isSearching}
              />
            )}
          </section>

          <FiltersSidebar 
            activeSection={activeSection}
            products={products}
            procurements={procurements}
            onFiltersChange={() => {}}
          />
        </div>
      </div>
    </main>
  );
}

// Компонент ProductsGrid
function ProductsGrid({ products, searchQuery, isSearching, onAddToProcurement, highlightAddToProcurement }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  if (isSearching) {
    return (
      <div className="products-grid">
        <div className="loading">Поиск...</div>
      </div>
    );
  }

  if (searchQuery && products.length === 0) {
    return (
      <div className="no-results">
        <div className="no-results-icon">🔍</div>
        <h3>Товары не найдены</h3>
        <p>Попробуйте изменить поисковый запрос</p>
      </div>
    );
  }

  return (
    <div className="products-grid">
      {products.map(product => {
        const categoryColor = getCategoryColor(product.category_name);
        const imageUrl = generateProductImage(product.name, categoryColor);
        
        return (
          <div key={product.id} className={`product-card ${highlightAddToProcurement ? 'highlight-add' : ''}`}>
            <div className="product-image">
              <img 
                src={imageUrl}
                alt={product.name}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div className="product-image-fallback" style={{display: 'none'}}>
                {product.name}
              </div>
              <button className="wishlist-btn">💙</button>
            </div>
            <div className="product-info">
              <h3 className="product-title">{product.name}</h3>
              <p className="product-category">{product.category_name}</p>
              <p className="product-company">{product.company}</p>
              <div className="product-price">
                <span className="current-price">{formatPrice(product.price_per_item)} ₽</span>
              </div>
              <p className="product-stock">В наличии: {product.amount || 10} шт.</p>
              <button 
                className="add-to-cart-btn"
                onClick={() => onAddToProcurement(product)}
              >
                {highlightAddToProcurement ? '➕ В закупку' : 'В закупку'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Компонент ProcurementsGrid
function ProcurementsGrid({ procurements, onParticipate, searchQuery, isSearching }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Не указана';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Не указана';
      }
      return date.toLocaleDateString('ru-RU');
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Не указана';
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'active': return { class: 'active', text: 'Активна' };
      case 'soon': return { class: 'soon', text: 'Скоро' };
      case 'completed': return { class: 'completed', text: 'Завершена' };
      default: return { class: 'active', text: status };
    }
  };

  if (isSearching) {
    return (
      <div className="procurements-grid">
        <div className="loading">Поиск...</div>
      </div>
    );
  }

  if (searchQuery && procurements.length === 0) {
    return (
      <div className="no-results">
        <div className="no-results-icon">🔍</div>
        <h3>Закупки не найдены</h3>
        <p>Попробуйте изменить поисковый запрос</p>
      </div>
    );
  }

  return (
    <div className="procurements-grid">
      {procurements.map(procurement => {
        const statusInfo = getStatusInfo(procurement.status);
        
        return (
          <div key={procurement.id} className="procurement-card">
            <div className="procurement-header">
              <h3 className="procurement-title">{procurement.title}</h3>
              <span className={`procurement-status ${statusInfo.class}`}>
                {statusInfo.text}
              </span>
            </div>
            
            <div className="procurement-info">
              {procurement.description && (
                <p className="procurement-description">
                  {procurement.description}
                </p>
              )}
              
              <div className="procurement-details">
                <div className="detail-item">
                  <span className="detail-label">Текущая цена:</span>
                  <span className="detail-value">{formatPrice(procurement.current_price)} ₽</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Заказчик:</span>
                  <span className="detail-value">{procurement.customer_name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Дата закупки:</span>
                  <span className="detail-value">
                    {formatDate(procurement.procurement_date)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Участников:</span>
                  <span className="detail-value">{procurement.participants_count}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Товаров в закупке:</span>
                  <span className="detail-value">{procurement.products?.length || 0}</span>
                </div>
              </div>

              {procurement.products && procurement.products.length > 0 && (
                <div className="procurement-products">
                  <h4>Товары в закупке:</h4>
                  {procurement.products.map((product, index) => (
                    <div key={product.product_id || index} className="procurement-product-item">
                      <span>{product.product_name}</span>
                      <span>{product.required_quantity} шт.</span>
                      <span>{formatPrice(product.unit_price)} ₽/шт</span>
                    </div>
                  ))}
                </div>
              )}

              {procurement.status === 'active' && (
                <button 
                  className="participate-btn"
                  onClick={() => onParticipate(procurement.id, procurement.current_price * 0.95)}
                >
                  Участвовать
                </button>
              )}
              
              {procurement.status === 'soon' && (
                <button className="notify-btn">
                  Уведомить о старте
                </button>
              )}
              
              {procurement.status === 'completed' && (
                <button className="view-results-btn">
                  Посмотреть результаты
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Компонент FiltersSidebar
function FiltersSidebar({ activeSection, onFiltersChange }) {
  const [filters, setFilters] = useState({
    categories: [],
    priceRange: { min: '', max: '' },
    procurementStatus: ['active']
  });

  const topLevelCategories = [
    { id: 1, name: 'Электроника' },
    { id: 2, name: 'Бытовая техника' },
    { id: 3, name: 'Одежда' },
    { id: 4, name: 'Мебель' }
  ];

  const handleCategoryChange = (categoryId) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter(id => id !== categoryId)
      : [...filters.categories, categoryId];
    
    const newFilters = { ...filters, categories: newCategories };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handlePriceChange = (field, value) => {
    const newPriceRange = { ...filters.priceRange, [field]: value };
    const newFilters = { ...filters, priceRange: newPriceRange };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleStatusChange = (status) => {
    const newStatus = filters.procurementStatus.includes(status)
      ? filters.procurementStatus.filter(s => s !== status)
      : [...filters.procurementStatus, status];
    
    const newFilters = { ...filters, procurementStatus: newStatus };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      categories: [],
      priceRange: { min: '', max: '' },
      procurementStatus: ['active']
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  return (
    <aside className="filters-sidebar">
      <div className="filters-header">
        <h3>Фильтры</h3>
        <button className="clear-filters-btn" onClick={clearFilters}>
          Очистить
        </button>
      </div>
      
      {activeSection === 'products' ? (
        <>
          <div className="filters-section">
            <h4>Категории</h4>
            <div className="filter-options">
              {topLevelCategories.map(category => (
                <label key={category.id} className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={filters.categories.includes(category.id)}
                    onChange={() => handleCategoryChange(category.id)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filters-section">
            <h4>Цена, ₽</h4>
            <div className="price-range">
              <div className="price-inputs">
                <input 
                  type="number" 
                  placeholder="0" 
                  className="price-input"
                  value={filters.priceRange.min}
                  onChange={(e) => handlePriceChange('min', e.target.value)}
                />
                <span>-</span>
                <input 
                  type="number" 
                  placeholder="100000" 
                  className="price-input"
                  value={filters.priceRange.max}
                  onChange={(e) => handlePriceChange('max', e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="filters-section">
            <h4>Статус закупки</h4>
            <div className="filter-options">
              <label className="filter-option">
                <input 
                  type="checkbox" 
                  checked={filters.procurementStatus.includes('active')}
                  onChange={() => handleStatusChange('active')}
                />
                <span>Активные</span>
              </label>
              <label className="filter-option">
                <input 
                  type="checkbox" 
                  checked={filters.procurementStatus.includes('soon')}
                  onChange={() => handleStatusChange('soon')}
                />
                <span>Скоро начнутся</span>
              </label>
              <label className="filter-option">
                <input 
                  type="checkbox" 
                  checked={filters.procurementStatus.includes('completed')}
                  onChange={() => handleStatusChange('completed')}
                />
                <span>Завершенные</span>
              </label>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

// Компонент Footer
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
            <h4>Возможности</h4>
            <a href="#">Автоматизация</a>
            <a href="#">Аналитика</a>
            <a href="#">Безопасность</a>
          </div>
          
          <div className="footer-section">
            <h4>Компания</h4>
            <a href="#">О нас</a>
            <a href="#">Контакты</a>
            <a href="#">Вакансии</a>
          </div>
          
          <div className="footer-section">
            <h4>Контакты</h4>
            <div className="contact-info">
              <p>🛡️ +7 (999) 999-99-99</p>
              <p>🛡️ hello@speedoflight.ru</p>
              <p>🛡️ Москва, ул. мира, 42</p>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; 2025 SpeedOfLight</p>
            <div className="footer-links">
              <a href="#">Политика конфиденциальности</a>
              <a href="#">Условия использования</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default App;