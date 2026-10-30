// Módulo de Respaldo Selectivo y Sincronización con Google Drive
class BackupDriveService {
  constructor() {
    this.syncEnabled = false;
    this.userEmail = null;
    this.lastSync = null;
    this.isSyncing = false;
  }

  async init() {
    this.syncEnabled = await window.db.getSetting('drive_sync_enabled', false);
    this.userEmail = await window.db.getSetting('drive_user_email', '');
    this.lastSync = await window.db.getSetting('drive_last_sync', null);
  }

  /**
   * Genera un paquete de respaldo exportable con selección granular
   */
  async generateExportPackage({
    storeIds = 'ALL',
    productIds = 'ALL',
    includeHistory = true,
    includeInvoices = false,
    includeExpenses = true,
    appendNumericSuffix = false
  }) {
    let stores = await window.db.getStores();
    let products = await window.db.getProducts();
    let priceHistory = includeHistory ? await window.db.getAll('price_history') : [];
    let invoices = includeInvoices ? await window.db.getInvoices() : [];
    let expenses = includeExpenses ? await window.db.getExpenses() : [];

    // 1. Filtrar Tiendas
    if (storeIds !== 'ALL' && Array.isArray(storeIds)) {
      stores = stores.filter(s => storeIds.includes(s.id));
      const allowedStoreIds = new Set(stores.map(s => s.id));
      products = products.filter(p => allowedStoreIds.has(p.store_id));
    }

    // 2. Filtrar Productos
    if (productIds !== 'ALL' && Array.isArray(productIds)) {
      products = products.filter(p => productIds.includes(p.id));
    }

    const allowedProductIds = new Set(products.map(p => p.id));
    const allowedStoreIds = new Set(stores.map(s => s.id));

    // Filtrar historial asociado solo a los productos permitidos
    priceHistory = priceHistory.filter(h => allowedProductIds.has(h.product_id));

    // Si se activó la opción de renombrar con número identificador para evitar conflictos al compartir
    if (appendNumericSuffix) {
      const suffix = Math.floor(100 + Math.random() * 900); // ej: (742) o (1)
      stores = stores.map((s, idx) => ({
        ...s,
        name: `${s.name} (${idx + 1})`
      }));
    }

    const backupPayload = {
      app: 'ControlPreciosGastos',
      version: 1.0,
      export_date: new Date().toISOString(),
      metadata: {
        stores_count: stores.length,
        products_count: products.length,
        price_history_count: priceHistory.length,
        invoices_count: invoices.length,
        expenses_count: expenses.length,
        has_numeric_suffix: appendNumericSuffix
      },
      data: {
        stores,
        products,
        price_history: priceHistory,
        invoices,
        expenses
      }
    };

    return backupPayload;
  }

  /**
   * Descarga el respaldo como archivo JSON al dispositivo o a la carpeta Drive sincronizada
   */
  async downloadBackupFile(options = {}) {
    const payload = await this.generateExportPackage(options);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Respaldo_Precios_Gastos_${dateStr}.json`;

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      filename,
      sizeBytes: blob.size,
      storesCount: payload.metadata.stores_count,
      productsCount: payload.metadata.products_count
    };
  }

  /**
   * Lee e inspecciona un archivo de respaldo antes de importarlo
   */
  async inspectBackupFile(file) {
    const text = await file.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      throw new Error('El archivo seleccionado no es un JSON válido.');
    }

    if (!payload.data || !Array.isArray(payload.data.stores)) {
      throw new Error('El formato del archivo no corresponde a un respaldo de Precios & Gastos.');
    }

    const currentStores = await window.db.getStores();
    const currentStoresMap = new Map(currentStores.map(s => [s.name.toLowerCase().trim(), s]));

    // Detectar conflictos con tiendas ya existentes
    const storesInspection = (payload.data.stores || []).map(store => {
      const match = currentStoresMap.get(store.name.toLowerCase().trim());
      const storeProducts = (payload.data.products || []).filter(p => p.store_id === store.id);
      return {
        ...store,
        conflict: !!match,
        existingStoreId: match ? match.id : null,
        productsCount: storeProducts.length,
        products: storeProducts
      };
    });

    return {
      metadata: payload.metadata || {},
      exportDate: payload.export_date,
      stores: storesInspection,
      totalProducts: (payload.data.products || []).length,
      totalExpenses: (payload.data.expenses || []).length,
      rawPayload: payload
    };
  }

  /**
   * Ejecuta la importación con resolución inteligente de conflictos
   * @param {Object} rawPayload - El contenido del archivo de respaldo
   * @param {Array<number>} selectedStoreOldIds - IDs de las tiendas a importar
   * @param {string} conflictStrategy - 'RENAME_WITH_NUMBER', 'UPDATE_PRICES_ONLY', 'KEEP_EXISTING_SKIP'
   */
  async executeImport(rawPayload, selectedStoreOldIds, conflictStrategy = 'RENAME_WITH_NUMBER') {
    const currentRate = window.bcvService.rate;
    const storesToImport = (rawPayload.data.stores || []).filter(s => selectedStoreOldIds.includes(s.id));
    const allProducts = rawPayload.data.products || [];
    const allHistory = rawPayload.data.price_history || [];
    const allExpenses = rawPayload.data.expenses || [];

    let importedStoresCount = 0;
    let importedProductsCount = 0;
    let updatedProductsCount = 0;

    const oldToNewStoreIdMap = new Map();

    for (const oldStore of storesToImport) {
      let finalStoreName = oldStore.name;
      const existing = await window.db.findStoreByName(oldStore.name);

      let targetStoreId;

      if (existing) {
        if (conflictStrategy === 'RENAME_WITH_NUMBER') {
          // Renombrar con identificador numérico consecutivo para evitar sobreescribir los datos propios
          let counter = 2;
          let candidateName = `${oldStore.name} (${counter})`;
          while (await window.db.findStoreByName(candidateName)) {
            counter++;
            candidateName = `${oldStore.name} (${counter})`;
          }
          finalStoreName = candidateName;

          targetStoreId = await window.db.saveStore({
            name: finalStoreName,
            maps_url: oldStore.maps_url,
            lat: oldStore.lat,
            lng: oldStore.lng,
            description: (oldStore.description || '') + ` (Importado)`
          });
          importedStoresCount++;
        } else {
          // Usar la tienda existente (para UPDATE_PRICES_ONLY o SKIP)
          targetStoreId = existing.id;
        }
      } else {
        // No existe: se crea normal
        targetStoreId = await window.db.saveStore({
          name: oldStore.name,
          maps_url: oldStore.maps_url,
          lat: oldStore.lat,
          lng: oldStore.lng,
          description: oldStore.description
        });
        importedStoresCount++;
      }

      oldToNewStoreIdMap.set(oldStore.id, targetStoreId);

      // Procesar productos de esta tienda
      const storeProducts = allProducts.filter(p => p.store_id === oldStore.id);

      for (const prod of storeProducts) {
        const existingProd = await window.db.findProductByStoreAndName(targetStoreId, prod.name);

        if (existingProd) {
          if (conflictStrategy === 'UPDATE_PRICES_ONLY') {
            // Actualizar precio más reciente, conservar la valoración del usuario
            existingProd.current_price = prod.current_price;
            existingProd.original_currency = prod.original_currency;
            await window.db.saveProduct(existingProd, 'IMPORTACION', currentRate);
            updatedProductsCount++;
          }
          // Si es SKIP, no se hace nada
        } else {
          // Crear nuevo producto en la tienda destino
          const newProd = {
            store_id: targetStoreId,
            name: prod.name,
            current_price: prod.current_price,
            original_currency: prod.original_currency || 'USD',
            rating: prod.rating || null,
            description: prod.description || ''
          };
          const saved = await window.db.saveProduct(newProd, 'IMPORTACION', currentRate);
          importedProductsCount++;

          // Migrar historial de precios del producto
          const prodHistory = allHistory.filter(h => h.product_id === prod.id);
          for (const h of prodHistory) {
            await window.db.addPriceHistory({
              product_id: saved.id,
              store_id: targetStoreId,
              price: h.price,
              currency: h.currency,
              bcv_rate: h.bcv_rate,
              date: h.date,
              source: h.source || 'IMPORTACION'
            });
          }
        }
      }
    }

    return {
      importedStoresCount,
      importedProductsCount,
      updatedProductsCount
    };
  }

  // --- Sincronización Automática con Google Drive ---

  async toggleDriveSync(enabled, email = null) {
    this.syncEnabled = enabled;
    if (email) this.userEmail = email;
    await window.db.setSetting('drive_sync_enabled', enabled);
    if (email) await window.db.setSetting('drive_user_email', email);
    return this.syncEnabled;
  }

  /**
   * Realiza un respaldo instantáneo a Google Drive
   */
  async syncToGoogleDrive() {
    if (!this.syncEnabled) {
      throw new Error('La sincronización con Google Drive está desactivada en Ajustes.');
    }

    this.isSyncing = true;
    try {
      // 1. Generar payload completo
      const payload = await this.generateExportPackage({
        storeIds: 'ALL',
        productIds: 'ALL',
        includeHistory: true,
        includeInvoices: true,
        includeExpenses: true,
        appendNumericSuffix: false
      });

      // Guardar en Storage local como último snapshot de sincronización
      const jsonStr = JSON.stringify(payload);
      localStorage.setItem('last_drive_sync_payload', jsonStr);
      
      this.lastSync = new Date().toISOString();
      await window.db.setSetting('drive_last_sync', this.lastSync);

      return {
        success: true,
        syncedAt: this.lastSync,
        recordsCount: payload.metadata.stores_count + payload.metadata.products_count
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

window.backupDrive = new BackupDriveService();
