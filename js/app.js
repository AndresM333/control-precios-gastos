// Controlador Principal de la Aplicación (Precios & Gastos PWA)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Iniciando Precios & Gastos PWA...');

  // 1. Inicializar Base de Datos y Servicios
  await window.db.ready;
  await window.bcvService.init();
  await window.backupDrive.init();

  // Sembrar datos de demostración si la base de datos está vacía
  await window.db.seedInitialDataIfEmpty(window.bcvService.rate);

  // Inicializar Gráfica Global
  const chartContainer = document.getElementById('productChartContainer');
  window.activePriceChart = new ProductPriceChart(chartContainer);

  // Variables de Estado en Memoria
  let currentActiveView = 'stores';
  let activeCompressedPhoto = null;
  let activeExtractionData = null;
  let activeScanMode = 'FACTURA';
  let pendingImportPayload = null;

  // ----------------------------------------------------
  // NAVEGACIÓN ENTRE VISTAS
  // ----------------------------------------------------
  function switchView(viewName) {
    currentActiveView = viewName;

    // Actualizar botones de navegación de escritorio
    document.querySelectorAll('.desktop-nav .nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Actualizar barra de navegación móvil
    document.querySelectorAll('.mobile-nav .mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Mostrar panel activo
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // Renderizar datos correspondientes a la vista
    if (viewName === 'stores') renderStores();
    if (viewName === 'products') renderProducts();
    if (viewName === 'planner') loadPlannerProductList();
    if (viewName === 'accounting') renderAccounting();
    if (viewName === 'invoices') renderInvoicesArchive();
    if (viewName === 'settings') loadSettingsForm();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Event Listeners de Navegación
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // ----------------------------------------------------
  // GESTIÓN DE TASA BCV
  // ----------------------------------------------------
  function updateBcvUI(rate) {
    const textEl = document.getElementById('bcvPillText');
    if (textEl) {
      textEl.textContent = `BCV: Bs. ${rate.toFixed(2)}`;
    }
    const inputRate = document.getElementById('inputManualBcvRate');
    if (inputRate) {
      inputRate.value = rate.toFixed(2);
    }
  }

  window.bcvService.subscribe((rate) => {
    updateBcvUI(rate);
    // Si la vista actual muestra precios convertidos, refrescar
    if (currentActiveView === 'products') renderProducts();
    if (currentActiveView === 'accounting') renderAccounting();
  });
  updateBcvUI(window.bcvService.rate);

  // Modal BCV
  document.getElementById('bcvPillBtn').addEventListener('click', () => {
    openModal('modalBcv');
  });

  document.getElementById('btnFetchOnlineBcv').addEventListener('click', async () => {
    showToast('Consultando tasa oficial en línea...', 'info');
    try {
      const rate = await window.bcvService.fetchLiveRate();
      showToast(`Tasa actualizada con éxito: Bs. ${rate.toFixed(2)}`, 'success');
      closeModal('modalBcv');
    } catch (err) {
      showToast('No se pudo obtener la tasa en línea. Escríbela manualmente.', 'error');
    }
  });

  document.getElementById('btnSaveManualBcv').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('inputManualBcvRate').value);
    if (!isNaN(val) && val > 0) {
      await window.bcvService.setManualRate(val);
      showToast(`Tasa manual establecida: Bs. ${val.toFixed(2)}`, 'success');
      closeModal('modalBcv');
    } else {
      showToast('Ingresa un número válido para la tasa', 'error');
    }
  });

  // ----------------------------------------------------
  // GESTIÓN DE MODALES
  // ----------------------------------------------------
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal(btn.dataset.modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ----------------------------------------------------
  // 1. TIENDAS (STORES)
  // ----------------------------------------------------
  async function renderStores() {
    const storesGrid = document.getElementById('storesGrid');
    const searchTerm = (document.getElementById('storeSearchInput').value || '').toLowerCase().trim();
    const stores = await window.db.getStores();
    const products = await window.db.getProducts();

    const filtered = stores.filter(s => {
      return s.name.toLowerCase().includes(searchTerm) || (s.description || '').toLowerCase().includes(searchTerm);
    });

    if (filtered.length === 0) {
      storesGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🏪</p>
          <p class="font-semibold text-slate-300">No se encontraron tiendas</p>
          <p class="text-xs text-slate-500 mt-1">Registra una con el botón "+ Nueva Tienda" o escanea una factura.</p>
        </div>
      `;
      return;
    }

    storesGrid.innerHTML = filtered.map(store => {
      const storeProducts = products.filter(p => p.store_id === store.id);
      const mapsLink = store.maps_url || (store.lat && store.lng ? `https://maps.google.com/?q=${store.lat},${store.lng}` : `https://maps.google.com/?q=${encodeURIComponent(store.name)}`);

      return `
        <div class="app-card">
          <div>
            <div class="card-header">
              <h3 class="card-title">${escapeHtml(store.name)}</h3>
              <span class="card-badge">${storeProducts.length} productos</span>
            </div>
            <p class="card-desc">${escapeHtml(store.description || 'Sin descripción')}</p>
          </div>
          
          <div class="card-footer">
            <a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm text-blue-400">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Google Maps
            </a>
            <div class="flex items-center gap-1.5">
              <button class="btn btn-secondary btn-sm btn-edit-store" data-id="${store.id}" title="Editar tienda">
                ✏️
              </button>
              <button class="btn btn-outline-danger btn-sm btn-delete-store" data-id="${store.id}" title="Eliminar tienda">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.btn-edit-store').forEach(btn => {
      btn.addEventListener('click', async () => {
        const store = await window.db.getById('stores', parseInt(btn.dataset.id));
        if (store) {
          document.getElementById('modalStoreTitle').textContent = 'Editar Tienda';
          document.getElementById('inputStoreId').value = store.id;
          document.getElementById('inputStoreName').value = store.name;
          document.getElementById('inputStoreMapsUrl').value = store.maps_url || '';
          document.getElementById('inputStoreLat').value = store.lat || '';
          document.getElementById('inputStoreLng').value = store.lng || '';
          document.getElementById('inputStoreDesc').value = store.description || '';
          openModal('modalStore');
        }
      });
    });

    document.querySelectorAll('.btn-delete-store').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta tienda y todos sus productos registrados?')) {
          await window.db.deleteStore(parseInt(btn.dataset.id));
          showToast('Tienda eliminada', 'info');
          renderStores();
        }
      });
    });
  }

  document.getElementById('storeSearchInput').addEventListener('input', renderStores);

  document.getElementById('btnNewStore').addEventListener('click', () => {
    document.getElementById('modalStoreTitle').textContent = 'Nueva Tienda';
    document.getElementById('formStore').reset();
    document.getElementById('inputStoreId').value = '';
    openModal('modalStore');
  });

  document.getElementById('formStore').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputStoreId').value;
    const name = document.getElementById('inputStoreName').value.trim();
    let mapsUrl = document.getElementById('inputStoreMapsUrl').value.trim();
    const lat = parseFloat(document.getElementById('inputStoreLat').value) || null;
    const lng = parseFloat(document.getElementById('inputStoreLng').value) || null;
    const desc = document.getElementById('inputStoreDesc').value.trim();

    if (!mapsUrl) {
      mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(name)}`;
    }

    await window.db.saveStore({
      id: id ? parseInt(id) : undefined,
      name,
      maps_url: mapsUrl,
      lat,
      lng,
      description: desc
    });

    showToast('Tienda guardada con éxito', 'success');
    closeModal('modalStore');
    renderStores();
  });

  // ----------------------------------------------------
  // 2. PRODUCTOS (PRODUCTS & RATINGS & DUAL PRICE)
  // ----------------------------------------------------
  async function renderProducts() {
    const productsGrid = document.getElementById('productsGrid');
    const searchTerm = (document.getElementById('productSearchInput').value || '').toLowerCase().trim();
    const storeFilter = document.getElementById('productStoreFilter').value;
    const products = await window.db.getProducts();
    const stores = await window.db.getStores();
    const storesMap = new Map(stores.map(s => [s.id, s]));

    // Populate select filter
    const storeSelect = document.getElementById('productStoreFilter');
    const currentVal = storeSelect.value;
    storeSelect.innerHTML = `<option value="ALL">Todas las tiendas (${stores.length})</option>` +
      stores.map(s => `<option value="${s.id}" ${currentVal == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    const currentRate = window.bcvService.rate;

    const filtered = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm) || (p.description || '').toLowerCase().includes(searchTerm);
      const matchStore = storeFilter === 'ALL' || p.store_id == storeFilter;
      return matchSearch && matchStore;
    });

    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🏷️</p>
          <p class="font-semibold text-slate-300">No se encontraron productos</p>
          <p class="text-xs text-slate-500 mt-1">Registra productos nuevos o escanea una factura.</p>
        </div>
      `;
      return;
    }

    productsGrid.innerHTML = filtered.map(prod => {
      const store = storesMap.get(prod.store_id) || { name: 'Tienda sin asignar' };

      // Conversión dual dinámica (USD y VES)
      let priceUsd = prod.current_price;
      let priceVes = prod.current_price;

      if (prod.original_currency === 'VES') {
        priceUsd = currentRate > 0 ? prod.current_price / currentRate : 0;
      } else {
        priceVes = prod.current_price * currentRate;
      }

      // Estrellas de valoración personal (1 a 5)
      const starsHtml = [1, 2, 3, 4, 5].map(starNum => {
        const isFilled = prod.rating && prod.rating >= starNum;
        return `<span class="star ${isFilled ? 'filled' : ''}" data-prod-id="${prod.id}" data-rating="${starNum}" title="Calificar con ${starNum} estrellas">★</span>`;
      }).join('');

      return `
        <div class="app-card">
          <div>
            <div class="card-header">
              <div>
                <span class="text-[11px] font-semibold text-blue-400 block">${escapeHtml(store.name)}</span>
                <h3 class="card-title text-base mt-0.5">${escapeHtml(prod.name)}</h3>
              </div>
              <!-- Dual Price Badge -->
              <div class="text-right">
                <span class="text-base font-extrabold text-slate-100 block">$ ${priceUsd.toFixed(2)}</span>
                <span class="text-[11px] font-semibold text-emerald-400">Bs. ${priceVes.toFixed(2)}</span>
              </div>
            </div>

            <p class="card-desc text-xs mt-2">${escapeHtml(prod.description || 'Sin notas adicionales')}</p>

            <!-- Star Rating (Clickable on card) -->
            <div class="flex items-center justify-between py-1.5 px-2 bg-slate-900/60 rounded-lg border border-slate-800/80 mt-2">
              <span class="text-[11px] text-slate-400 font-medium">Calidad:</span>
              <div class="star-rating card-stars">
                ${starsHtml}
              </div>
            </div>
          </div>

          <div class="card-footer mt-3">
            <button class="btn btn-secondary btn-sm btn-view-chart" data-id="${prod.id}" title="Ver historial de precios y gráfica porcentual">
              📈 Gráfica & %
            </button>
            <div class="flex items-center gap-1.5">
              <button class="btn btn-secondary btn-sm btn-edit-product" data-id="${prod.id}">✏️</button>
              <button class="btn btn-outline-danger btn-sm btn-delete-product" data-id="${prod.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listener on stars to update rating directly
    document.querySelectorAll('.card-stars .star').forEach(star => {
      star.addEventListener('click', async () => {
        const prodId = parseInt(star.dataset.prodId);
        const rating = parseInt(star.dataset.rating);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          prod.rating = rating;
          await window.db.put('products', prod);
          showToast(`Valoración guardada: ${rating} ⭐ para ${prod.name}`, 'success');
          renderProducts();
        }
      });
    });

    // View Price History Chart
    document.querySelectorAll('.btn-view-chart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = parseInt(btn.dataset.id);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          const store = storesMap.get(prod.store_id) || { name: 'Tienda' };
          const history = await window.db.getPriceHistory(prodId);

          document.getElementById('modalChartProductName').textContent = prod.name;
          document.getElementById('modalChartStoreName').textContent = `Comercio: ${store.name}`;

          window.activePriceChart.setData(prod, history);
          openModal('modalPriceChart');
        }
      });
    });

    // Edit Product
    document.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prod = await window.db.getById('products', parseInt(btn.dataset.id));
        if (prod) {
          await populateStoreSelect('inputProductStoreId', prod.store_id);
          document.getElementById('modalProductTitle').textContent = 'Editar Producto';
          document.getElementById('inputProductId').value = prod.id;
          document.getElementById('inputProductName').value = prod.name;
          document.getElementById('inputProductPrice').value = prod.current_price;
          document.getElementById('inputProductCurrency').value = prod.original_currency || 'USD';
          document.getElementById('inputProductDesc').value = prod.description || '';
          setModalRatingStars(prod.rating || 0);
          openModal('modalProduct');
        }
      });
    });

    // Delete Product
    document.querySelectorAll('.btn-delete-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este producto y su historial de precios?')) {
          await window.db.deleteProduct(parseInt(btn.dataset.id));
          showToast('Producto eliminado', 'info');
          renderProducts();
        }
      });
    });
  }

  document.getElementById('productSearchInput').addEventListener('input', renderProducts);
  document.getElementById('productStoreFilter').addEventListener('change', renderProducts);

  // Modal Rating Stars Handler
  function setModalRatingStars(ratingVal) {
    document.getElementById('inputProductRating').value = ratingVal || '';
    document.querySelectorAll('#productModalRatingStars .star').forEach(star => {
      const val = parseInt(star.dataset.val);
      star.classList.toggle('filled', val <= (ratingVal || 0));
    });
  }

  document.querySelectorAll('#productModalRatingStars .star').forEach(star => {
    star.addEventListener('click', () => {
      setModalRatingStars(parseInt(star.dataset.val));
    });
  });

  document.getElementById('btnClearProductRating').addEventListener('click', () => {
    setModalRatingStars(0);
  });

  async function populateStoreSelect(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    const stores = await window.db.getStores();
    select.innerHTML = stores.map(s => `
      <option value="${s.id}" ${selectedId == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
    `).join('');
  }

  document.getElementById('btnNewProduct').addEventListener('click', async () => {
    const stores = await window.db.getStores();
    if (stores.length === 0) {
      showToast('Debes crear al menos una tienda antes de registrar productos', 'error');
      openModal('modalStore');
      return;
    }
    await populateStoreSelect('inputProductStoreId');
    document.getElementById('modalProductTitle').textContent = 'Nuevo Producto';
    document.getElementById('formProduct').reset();
    document.getElementById('inputProductId').value = '';
    setModalRatingStars(0);
    openModal('modalProduct');
  });

  document.getElementById('formProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputProductId').value;
    const storeId = parseInt(document.getElementById('inputProductStoreId').value);
    const name = document.getElementById('inputProductName').value.trim();
    const price = parseFloat(document.getElementById('inputProductPrice').value);
    const currency = document.getElementById('inputProductCurrency').value;
    const ratingVal = parseInt(document.getElementById('inputProductRating').value) || null;
    const desc = document.getElementById('inputProductDesc').value.trim();

    await window.db.saveProduct({
      id: id ? parseInt(id) : undefined,
      store_id: storeId,
      name,
      current_price: price,
      original_currency: currency,
      rating: ratingVal, // Conserva o actualiza la valoración manual
      description: desc
    }, 'MANUAL', window.bcvService.rate);

    showToast('Producto guardado con éxito', 'success');
    closeModal('modalProduct');
    renderProducts();
  });

  // ----------------------------------------------------
  // 3. ESCANEO CON IA & COMPRESIÓN EXTREMA
  // ----------------------------------------------------
  const scanModeInvoiceBtn = document.getElementById('scanModeInvoiceBtn');
  const scanModeTableBtn = document.getElementById('scanModeTableBtn');

  scanModeInvoiceBtn.addEventListener('click', () => {
    activeScanMode = 'FACTURA';
    scanModeInvoiceBtn.className = 'p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-semibold text-sm flex items-center justify-center gap-2';
    scanModeTableBtn.className = 'p-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2';
  });

  scanModeTableBtn.addEventListener('click', () => {
    activeScanMode = 'TABLA_PRECIOS';
    scanModeTableBtn.className = 'p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-semibold text-sm flex items-center justify-center gap-2';
    scanModeInvoiceBtn.className = 'p-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2';
  });

  document.getElementById('btnTriggerCamera').addEventListener('click', () => {
    document.getElementById('cameraFileInput').click();
  });

  document.getElementById('btnTriggerGallery').addEventListener('click', () => {
    document.getElementById('galleryFileInput').click();
  });

  async function handleImageFile(file) {
    if (!file) return;
    showToast('Comprimiendo imagen al máximo...', 'info');

    try {
      // Pipeline de Compresión Extrema
      const compressed = await ExtremeImageCompressor.compress(file, {
        maxWidth: 800,
        quality: 0.32,
        enhanceContrast: true
      });

      activeCompressedPhoto = compressed;

      // Mostrar preview y estadísticas
      document.getElementById('scanPreviewImg').src = compressed.dataUrl;
      document.getElementById('compOrigSize').textContent = compressed.originalFormatted;
      document.getElementById('compFinalSize').textContent = compressed.compressedFormatted;
      document.getElementById('compressionSavingsBadge').textContent = `${compressed.savingsPercent}% Ahorro`;

      document.getElementById('scanPreviewCard').classList.remove('hidden');
      document.getElementById('scanResultBox').classList.add('hidden');

      showToast(`Foto reducida a sólo ${compressed.compressedFormatted} (${compressed.savingsPercent}% ahorro)`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al procesar la foto: ' + err.message, 'error');
    }
  }

  document.getElementById('cameraFileInput').addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });
  document.getElementById('galleryFileInput').addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });

  // Procesar con IA
  document.getElementById('btnProcessAI').addEventListener('click', async () => {
    if (!activeCompressedPhoto) {
      showToast('Primero toma o sube una foto', 'error');
      return;
    }

    const apiKey = await window.aiScanner.getApiKey();
    if (!apiKey) {
      const enteredKey = prompt(
        'Ingresa tu clave gratuita de Google Gemini (AI Studio).\nPuedes obtenerla gratis en aistudio.google.com/app/apikey:'
      );
      if (enteredKey && enteredKey.trim().length > 10) {
        await window.aiScanner.setApiKey(enteredKey.trim());
      } else {
        showToast('Se requiere una clave API para analizar con IA.', 'error');
        return;
      }
    }

    const processBtn = document.getElementById('btnProcessAI');
    processBtn.disabled = true;
    processBtn.innerHTML = '⏳ Analizando con Gemini Flash...';

    try {
      const result = await window.aiScanner.analyzeImage(activeCompressedPhoto.dataUrl, activeScanMode);
      activeExtractionData = result;

      // Mostrar resultados para confirmación
      document.getElementById('extractedStoreName').textContent = result.store_name || 'Tienda Desconocida';
      const currSymbol = result.currency === 'VES' ? 'Bs.' : '$';
      document.getElementById('extractedTotalAmount').textContent = `${currSymbol} ${(parseFloat(result.total) || 0).toFixed(2)}`;

      const tbody = document.getElementById('extractedItemsTableBody');
      tbody.innerHTML = (result.items || []).map(item => `
        <tr class="hover:bg-slate-800/50">
          <td class="p-2.5 font-medium text-slate-200">${escapeHtml(item.name)}</td>
          <td class="p-2.5 text-center text-slate-400">${item.quantity || 1}</td>
          <td class="p-2.5 text-right font-semibold text-slate-100">${currSymbol} ${(parseFloat(item.price) || 0).toFixed(2)}</td>
          <td class="p-2.5 text-right font-bold text-emerald-400">${currSymbol} ${(parseFloat(item.total) || ((item.price || 0) * (item.quantity || 1))).toFixed(2)}</td>
        </tr>
      `).join('');

      document.getElementById('scanResultBox').classList.remove('hidden');
      showToast('Extracción completada con éxito. Revisa y confirma.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al analizar con IA: ' + err.message, 'error');
    } finally {
      processBtn.disabled = false;
      processBtn.innerHTML = '✨ Analizar Factura con Gemini Flash';
    }
  });

  // Confirmar y Guardar en BD
  document.getElementById('btnConfirmScan').addEventListener('click', async () => {
    if (!activeExtractionData) return;

    try {
      const commitRes = await window.aiScanner.processAndCommitExtraction(activeExtractionData, activeCompressedPhoto);

      showToast(
        `¡Guardado! ${commitRes.newProductsCount} productos nuevos, ${commitRes.updatedProductsCount} actualizados.`,
        'success'
      );

      // Limpiar estado
      activeExtractionData = null;
      activeCompressedPhoto = null;
      document.getElementById('scanPreviewCard').classList.add('hidden');
      document.getElementById('scanResultBox').classList.add('hidden');
      document.getElementById('cameraFileInput').value = '';
      document.getElementById('galleryFileInput').value = '';

      // Redirigir a productos o contabilidad
      switchView('products');
    } catch (err) {
      console.error(err);
      showToast('Error al registrar en la base de datos: ' + err.message, 'error');
    }
  });

  document.getElementById('btnDiscardScan').addEventListener('click', () => {
    activeExtractionData = null;
    document.getElementById('scanResultBox').classList.add('hidden');
    showToast('Escaneo descartado', 'info');
  });

  // ----------------------------------------------------
  // 4. PROGRAMAR MERCADO (GROCERY PLANNER)
  // ----------------------------------------------------
  async function loadPlannerProductList() {
    const container = document.getElementById('plannerChecklist');
    const searchFilter = (document.getElementById('plannerSearchInput').value || '').toLowerCase().trim();
    const products = await window.db.getProducts();

    // Obtener nombres únicos de productos ordenados alfabéticamente
    const uniqueNames = Array.from(new Set(products.map(p => p.name.trim()))).sort();

    const filtered = uniqueNames.filter(name => name.toLowerCase().includes(searchFilter));

    container.innerHTML = filtered.map((name, idx) => `
      <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800 cursor-pointer text-xs transition">
        <input type="checkbox" class="planner-item-chk rounded bg-slate-900 border-slate-700 text-blue-500" value="${escapeHtml(name)}">
        <span class="text-slate-200">${escapeHtml(name)}</span>
      </label>
    `).join('');

    // Listener para actualizar contador
    document.querySelectorAll('.planner-item-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const selected = document.querySelectorAll('.planner-item-chk:checked').length;
        document.getElementById('plannerSelectedCount').textContent = `${selected} seleccionados`;
      });
    });
  }

  document.getElementById('plannerSearchInput').addEventListener('input', loadPlannerProductList);

  document.getElementById('btnExecutePlanner').addEventListener('click', async () => {
    const selectedCheckboxes = document.querySelectorAll('.planner-item-chk:checked');
    const selectedNames = Array.from(selectedCheckboxes).map(c => c.value);

    if (selectedNames.length === 0) {
      showToast('Selecciona al menos un producto de la lista', 'error');
      return;
    }

    showToast('Optimizando compra...', 'info');
    const plan = await window.groceryPlanner.planMarket(selectedNames);

    // 1. Tarjeta La Más Barata
    const cardCheapest = document.getElementById('cardBestCheapest');
    if (plan.bestCheapest) {
      cardCheapest.querySelector('.store-name').textContent = plan.bestCheapest.store.name;
      cardCheapest.querySelector('.store-summary').textContent = `${plan.bestCheapest.available.length}/${selectedNames.length} productos disponibles`;
      cardCheapest.querySelector('.store-price').textContent = `$ ${plan.bestCheapest.totalCostUSD.toFixed(2)}`;
    } else {
      cardCheapest.querySelector('.store-name').textContent = 'No disponible';
    }

    // 2. Tarjeta La Más Cercana
    const cardClosest = document.getElementById('cardBestClosest');
    if (plan.bestClosest) {
      cardClosest.querySelector('.store-name').textContent = plan.bestClosest.store.name;
      cardClosest.querySelector('.store-summary').textContent = `${plan.bestClosest.available.length}/${selectedNames.length} productos`;
      cardClosest.querySelector('.store-distance').textContent = plan.bestClosest.distanceKm ? `${plan.bestClosest.distanceKm.toFixed(1)} km` : 'Ver en mapa';
    }

    // 3. Tarjeta Mejor Valorada
    const cardRated = document.getElementById('cardBestRated');
    if (plan.bestRated && plan.bestRated.avgRating) {
      cardRated.querySelector('.store-name').textContent = plan.bestRated.store.name;
      cardRated.querySelector('.store-summary').textContent = `Promedio de calidad personal`;
      cardRated.querySelector('.store-rating').textContent = `⭐ ${plan.bestRated.avgRating.toFixed(1)} / 5`;
    } else {
      cardRated.querySelector('.store-name').textContent = 'Sin calificaciones';
      cardRated.querySelector('.store-rating').textContent = '⭐ --';
    }

    // Lista comparativa detallada
    const listContainer = document.getElementById('plannerResultsList');
    listContainer.innerHTML = plan.recommendations.map(r => {
      const missingTags = r.missing.map(m => `
        <span class="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">Falta: ${escapeHtml(m)}</span>
      `).join(' ');

      return `
        <div class="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-100 text-sm">${escapeHtml(r.store.name)}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.coveragePercent === 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
                ${r.available.length}/${selectedNames.length} encontrados (${r.coveragePercent}%)
              </span>
            </div>
            ${r.missing.length > 0 ? `<div class="flex flex-wrap gap-1 mt-1.5">${missingTags}</div>` : ''}
          </div>

          <div class="flex items-center gap-4 text-right">
            <div>
              <span class="text-sm font-extrabold text-emerald-400 block">$ ${r.totalCostUSD.toFixed(2)}</span>
              <span class="text-[10px] text-slate-400">Bs. ${r.totalCostVES.toFixed(2)}</span>
            </div>
            <a href="${r.store.maps_url || '#'}" target="_blank" class="btn btn-secondary btn-sm">
              📍 Ir
            </a>
          </div>
        </div>
      `;
    }).join('');
  });

  // ----------------------------------------------------
  // 5. CONTABILIDAD (EXPENSES)
  // ----------------------------------------------------
  let currentExpensePeriod = 'MONTH';

  async function renderAccounting() {
    const summary = await window.accountingService.getSummary(currentExpensePeriod);

    document.getElementById('statTotalUSD').textContent = `$ ${summary.totalUSD.toFixed(2)}`;
    document.getElementById('statTotalVES').textContent = `Bs. ${summary.totalVES.toFixed(2)}`;
    document.getElementById('statSubUSD').textContent = `${summary.count} transacciones`;
    document.getElementById('statFacturasCount').textContent = `🧾 ${summary.invoiceExpensesCount} Facturas`;
    document.getElementById('statManualesCount').textContent = `✍️ ${summary.manualExpensesCount} Manuales`;

    const list = document.getElementById('expensesList');
    if (summary.expenses.length === 0) {
      list.innerHTML = `<p class="text-xs text-slate-500 py-6 text-center">No hay gastos registrados en este período.</p>`;
      return;
    }

    list.innerHTML = summary.expenses.map(exp => {
      const isInvoice = exp.source === 'FACTURA';
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs hover:border-slate-700 transition">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center ${isInvoice ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'} font-bold">
              ${isInvoice ? '🧾' : '✍️'}
            </span>
            <div>
              <span class="font-bold text-slate-100 block">${escapeHtml(exp.concept)}</span>
              <span class="text-[11px] text-slate-400">${exp.date} • <span class="text-slate-300 font-semibold">${escapeHtml(exp.category || 'Otros')}</span></span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-sm font-bold text-slate-100 block">$ ${parseFloat(exp.amount_usd || 0).toFixed(2)}</span>
            <span class="text-[10px] text-emerald-400 font-medium">Bs. ${parseFloat(exp.amount_ves || 0).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('btn-primary', 'active-period'));
      btn.classList.add('btn-primary', 'active-period');
      currentExpensePeriod = btn.dataset.period;
      renderAccounting();
    });
  });

  document.getElementById('btnNewManualExpense').addEventListener('click', () => {
    document.getElementById('formExpense').reset();
    document.getElementById('inputExpenseDate').value = new Date().toISOString().split('T')[0];
    openModal('modalExpense');
  });

  document.getElementById('formExpense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const concept = document.getElementById('inputExpenseConcept').value.trim();
    const amount = parseFloat(document.getElementById('inputExpenseAmount').value);
    const currency = document.getElementById('inputExpenseCurrency').value;
    const category = document.getElementById('inputExpenseCategory').value;
    const date = document.getElementById('inputExpenseDate').value;
    const note = document.getElementById('inputExpenseNote').value.trim();

    await window.accountingService.addManualExpense({
      concept,
      amount,
      currency,
      category,
      date,
      note
    });

    showToast('Gasto manual registrado con éxito', 'success');
    closeModal('modalExpense');
    renderAccounting();
  });

  // ----------------------------------------------------
  // 6. ARCHIVO DE FACTURAS (INVOICE ARCHIVE)
  // ----------------------------------------------------
  async function renderInvoicesArchive() {
    const grid = document.getElementById('invoicesGrid');
    const invoices = await window.db.getInvoices();

    if (invoices.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🗃️</p>
          <p class="font-semibold text-slate-300">No hay facturas archivadas</p>
          <p class="text-xs text-slate-500 mt-1">Escanea tu primera factura para guardarla comprimida.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = invoices.map(inv => {
      const hasPhoto = !!inv.photo_compressed_base64;
      const photoThumb = hasPhoto 
        ? `<img src="${inv.photo_compressed_base64}" alt="Factura" class="w-full h-36 object-cover rounded-lg border border-slate-700">`
        : `<div class="w-full h-36 bg-slate-900 rounded-lg flex items-center justify-center text-slate-600 text-3xl">🧾</div>`;

      return `
        <div class="app-card">
          <div>
            <div class="mb-3">${photoThumb}</div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-400">${escapeHtml(inv.store_name)}</span>
              <span class="text-[10px] text-slate-400">${inv.date}</span>
            </div>
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
              <span class="text-xs text-slate-400">${inv.items_count || (inv.items_json ? inv.items_json.length : 0)} ítems</span>
              <span class="font-black text-emerald-400 text-sm">$ ${(inv.total_usd || 0).toFixed(2)}</span>
            </div>
          </div>
          <div class="card-footer mt-3">
            <span class="text-[10px] text-slate-500">~${Math.round((inv.photo_size_bytes || 25000) / 1024)} KB WebP</span>
            <button class="btn btn-secondary btn-sm btn-view-invoice" data-id="${inv.id}">
              🔍 Ver Factura
            </button>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.btn-view-invoice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const inv = await window.db.getById('invoices', parseInt(btn.dataset.id));
        if (inv) {
          document.getElementById('invDetailStore').textContent = inv.store_name;
          document.getElementById('invDetailDate').textContent = `${inv.date} • Tasa: Bs. ${(inv.bcv_rate || 0).toFixed(2)}`;
          document.getElementById('invDetailTotals').textContent = `$ ${(inv.total_usd || 0).toFixed(2)} / Bs. ${(inv.total_ves || 0).toFixed(2)}`;
          
          const photoImg = document.getElementById('invDetailPhoto');
          if (inv.photo_compressed_base64) {
            photoImg.src = inv.photo_compressed_base64;
            document.getElementById('invDetailPhotoContainer').classList.remove('hidden');
          } else {
            document.getElementById('invDetailPhotoContainer').classList.add('hidden');
          }

          document.getElementById('invDetailSize').textContent = `Peso en BD: ${Math.round((inv.photo_size_bytes || 0) / 1024)} KB (WebP)`;

          const itemsTbody = document.getElementById('invDetailItemsTable');
          itemsTbody.innerHTML = (inv.items_json || []).map(item => `
            <tr>
              <td class="p-2 text-slate-200">${escapeHtml(item.name)}</td>
              <td class="p-2 text-right font-bold text-slate-100">$ ${(item.price || 0).toFixed(2)}</td>
            </tr>
          `).join('');

          openModal('modalInvoiceDetail');
        }
      });
    });
  }

  // ----------------------------------------------------
  // 7. AJUSTES, RESPALDO Y GOOGLE DRIVE
  // ----------------------------------------------------
  async function loadSettingsForm() {
    const key = await window.aiScanner.getApiKey();
    document.getElementById('inputGeminiApiKey').value = key || '';

    const syncEnabled = await window.db.getSetting('drive_sync_enabled', false);
    const driveToggle = document.getElementById('toggleDriveSync');
    driveToggle.checked = syncEnabled;
    updateDriveStatusUI(syncEnabled);
  }

  function updateDriveStatusUI(enabled) {
    const statusDesc = document.getElementById('driveStatusDesc');
    const pill = document.getElementById('drivePillBtn');
    const pillText = document.getElementById('drivePillText');

    if (enabled) {
      statusDesc.textContent = 'Activada: Se sincroniza automáticamente';
      pill.classList.remove('disabled');
      pillText.textContent = 'Drive: Activo';
    } else {
      statusDesc.textContent = 'Desactivada por el usuario';
      pill.classList.add('disabled');
      pillText.textContent = 'Drive';
    }
  }

  document.getElementById('btnSaveGeminiKey').addEventListener('click', async () => {
    const key = document.getElementById('inputGeminiApiKey').value.trim();
    await window.aiScanner.setApiKey(key);
    showToast('Clave de Gemini guardada correctamente', 'success');
  });

  document.getElementById('toggleDriveSync').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await window.backupDrive.toggleDriveSync(enabled);
    updateDriveStatusUI(enabled);
    showToast(enabled ? 'Sincronización en la nube activada' : 'Sincronización desactivada', 'info');
  });

  document.getElementById('btnManualDriveSync').addEventListener('click', async () => {
    try {
      showToast('Sincronizando con Google Drive...', 'info');
      await window.backupDrive.syncToGoogleDrive();
      showToast('¡Base de datos sincronizada exitosamente con la nube!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Exportar Respaldo
  document.getElementById('btnDownloadBackup').addEventListener('click', async () => {
    const appendSuffix = document.getElementById('chkExportNumberedStores').checked;
    const includeHistory = document.getElementById('chkExportIncludeHistory').checked;
    const includeExpenses = document.getElementById('chkExportIncludeExpenses').checked;

    showToast('Generando archivo de respaldo...', 'info');

    const result = await window.backupDrive.downloadBackupFile({
      storeIds: 'ALL',
      productIds: 'ALL',
      includeHistory,
      includeExpenses,
      appendNumericSuffix: appendSuffix
    });

    showToast(`Respaldo descargado: ${result.filename}`, 'success');
  });

  // Importar Respaldo
  document.getElementById('btnTriggerImportFile').addEventListener('click', () => {
    document.getElementById('inputImportBackupFile').click();
  });

  document.getElementById('inputImportBackupFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const inspection = await window.backupDrive.inspectBackupFile(file);
      pendingImportPayload = inspection.rawPayload;

      // Mostrar resumen en modal inspector
      document.getElementById('importStatsOverview').innerHTML = `
        <p><strong>Fecha del respaldo:</strong> ${inspection.exportDate.split('T')[0]}</p>
        <p><strong>Tiendas contenidas:</strong> ${inspection.stores.length}</p>
        <p><strong>Total Productos:</strong> ${inspection.totalProducts}</p>
        <p><strong>Total Asientos Contables:</strong> ${inspection.totalExpenses}</p>
      `;

      // Checkbox list de tiendas
      const listContainer = document.getElementById('importStoresList');
      listContainer.innerHTML = inspection.stores.map(s => `
        <label class="flex items-center justify-between p-2 rounded bg-slate-800/60 text-xs">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="import-store-chk" value="${s.id}" checked>
            <span class="font-bold text-slate-100">${escapeHtml(s.name)}</span>
            <span class="text-slate-400">(${s.productsCount} prods)</span>
          </div>
          ${s.conflict ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold">Ya existe</span>' : '<span class="text-[10px] text-emerald-400 font-bold">Nueva</span>'}
        </label>
      `).join('');

      openModal('modalImportInspector');
    } catch (err) {
      showToast('Error al inspeccionar respaldo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btnExecuteFinalImport').addEventListener('click', async () => {
    if (!pendingImportPayload) return;

    const selectedCheckboxes = document.querySelectorAll('.import-store-chk:checked');
    const selectedStoreIds = Array.from(selectedCheckboxes).map(c => parseInt(c.value));
    const strategy = document.getElementById('importConflictStrategy').value;

    if (selectedStoreIds.length === 0) {
      showToast('Selecciona al menos una tienda para importar', 'error');
      return;
    }

    try {
      const res = await window.backupDrive.executeImport(pendingImportPayload, selectedStoreIds, strategy);
      showToast(`¡Importación lista! ${res.importedStoresCount} tiendas añadidas, ${res.importedProductsCount} productos nuevos.`, 'success');
      closeModal('modalImportInspector');
      pendingImportPayload = null;
      renderStores();
    } catch (err) {
      showToast('Fallo en la importación: ' + err.message, 'error');
    }
  });

  // ----------------------------------------------------
  // REGISTRO DE SERVICE WORKER (PWA)
  // ----------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('Service Worker registrado con éxito:', reg.scope);
    }).catch((err) => {
      console.warn('Registro de Service Worker falló:', err);
    });
  }

  // Helper para escapar HTML en strings dinámicos
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Soporte para accesos directos de Shortcut Manager / PWA Shortcuts
  const urlParams = new URLSearchParams(window.location.search);
  const actionParam = urlParams.get('action');

  if (actionParam === 'scan') {
    switchView('scanner');
  } else if (actionParam === 'planner') {
    switchView('planner');
  } else if (actionParam === 'expense') {
    switchView('accounting');
    setTimeout(() => {
      document.getElementById('formExpense').reset();
      document.getElementById('inputExpenseDate').value = new Date().toISOString().split('T')[0];
      openModal('modalExpense');
    }, 200);
  } else {
    // Carga inicial de la primera vista
    switchView('stores');
  }
});
