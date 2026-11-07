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
    let groups = (window.db && window.db.getGroups) ? await window.db.getGroups() : [];

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
        groups_count: (groups || []).length,
        has_numeric_suffix: appendNumericSuffix
      },
      data: {
        stores,
        products,
        price_history: priceHistory,
        invoices,
        expenses,
        groups: groups || []
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
    const storeIdList = (selectedStoreOldIds === 'ALL' || !Array.isArray(selectedStoreOldIds))
      ? (rawPayload.data.stores || []).map(s => s.id)
      : (selectedStoreOldIds || []);
    const storesToImport = (rawPayload.data.stores || []).filter(s => storeIdList.includes(s.id));
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

    // Importar grupos compartidos si vienen en el paquete
    if (rawPayload.data && Array.isArray(rawPayload.data.groups)) {
      for (const grp of rawPayload.data.groups) {
        if (!grp || !grp.id) continue;
        const existingGrp = await window.db.getById('groups', grp.id);
        if (!existingGrp) {
          await window.db.saveGroup(grp);
        }
      }
      if (window.authGroups) {
        await window.authGroups.refreshUserGroups();
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
   * Obtiene un token de acceso OAuth2 de Google con alcance drive.file
   */
  async getDriveAccessToken() {
    return new Promise(async (resolve, reject) => {
      const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
      if (!user || !user.email) {
        return reject(new Error('Debes iniciar sesión con tu cuenta de Google.'));
      }

      // 1. Revisar token en caché de sesión
      const cachedToken = sessionStorage.getItem('gdrive_access_token');
      const cachedExpiry = sessionStorage.getItem('gdrive_token_expires_at');
      if (cachedToken && cachedExpiry && Date.now() < parseInt(cachedExpiry, 10)) {
        return resolve(cachedToken);
      }

      // 2. Verificar que Google GIS esté disponible
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        return reject(new Error('La librería Google Identity Services no está lista aún. Reintenta en unos segundos.'));
      }

      const clientId = (typeof GOOGLE_CLIENT_ID_CONFIG !== 'undefined' && GOOGLE_CLIENT_ID_CONFIG) 
        ? GOOGLE_CLIENT_ID_CONFIG.trim() 
        : (await window.db.getSetting('google_client_id') || '');

      if (!clientId) {
        return reject(new Error('No se ha configurado el Client ID de Google OAuth.'));
      }

      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          hint: user.email,
          prompt: '',
          callback: (response) => {
            if (response.error) {
              return reject(new Error(`Permiso de Google Drive no otorgado: ${response.error}`));
            }
            if (response.access_token) {
              const expiresInMs = (parseInt(response.expires_in, 10) || 3500) * 1000;
              sessionStorage.setItem('gdrive_access_token', response.access_token);
              sessionStorage.setItem('gdrive_token_expires_at', String(Date.now() + expiresInMs - 60000));
              return resolve(response.access_token);
            }
            reject(new Error('No se recibió el token de acceso de Google Drive.'));
          }
        });

        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Busca si ya existe el archivo de respaldo en Google Drive
   */
  async findDriveBackupFile(accessToken) {
    const query = encodeURIComponent("name = 'control_precios_gastos_backup.json' and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)&spaces=drive`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error?.message || '';
      if (response.status === 403 && (msg.includes('Google Drive API has not been used') || msg.includes('disabled'))) {
        const apiError = new Error('GOOGLE_DRIVE_API_DISABLED');
        apiError.details = msg;
        throw apiError;
      }
      throw new Error(msg || `Error ${response.status} al consultar Google Drive`);
    }

    const data = await response.json();
    return (data.files && data.files.length > 0) ? data.files[0] : null;
  }

  /**
   * Sube o actualiza el archivo de respaldo en Google Drive
   */
  async uploadToGoogleDrive() {
    const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
    if (!user || !user.email) {
      throw new Error('Debes iniciar sesión con tu cuenta de Google.');
    }

    this.isSyncing = true;
    this.userEmail = user.email;
    await window.db.setSetting('drive_user_email', user.email);

    try {
      const payload = await this.generateExportPackage({
        storeIds: 'ALL',
        productIds: 'ALL',
        includeHistory: true,
        includeInvoices: true,
        includeExpenses: true,
        appendNumericSuffix: false
      });

      payload.metadata.user_email = user.email;
      payload.metadata.user_name = user.displayName || user.email;
      payload.metadata.synced_at = new Date().toISOString();

      const jsonStr = JSON.stringify(payload);
      localStorage.setItem(`drive_backup_${user.email}`, jsonStr);
      localStorage.setItem('last_drive_sync_payload', jsonStr);

      const token = await this.getDriveAccessToken();
      const existingFile = await this.findDriveBackupFile(token);

      if (existingFile && existingFile.id) {
        // Actualizar archivo existente (PATCH media)
        const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
        const patchRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: jsonStr
        });

        if (!patchRes.ok) {
          const errData = await patchRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Error ${patchRes.status} al actualizar respaldo en Google Drive`);
        }
      } else {
        // Crear nuevo archivo con multipart upload
        const metadata = {
          name: 'control_precios_gastos_backup.json',
          mimeType: 'application/json',
          description: `Respaldo sincronizado de Control de Precios y Gastos (${user.email})`
        };

        const boundary = '-------PGDriveBoundary' + Date.now();
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelim = "\r\n--" + boundary + "--";

        const multipartBody = delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          jsonStr +
          closeDelim;

        const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: multipartBody
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Error ${createRes.status} al crear archivo en Google Drive`);
        }
      }

      this.lastSync = new Date().toISOString();
      await window.db.setSetting('drive_last_sync', this.lastSync);

      return {
        success: true,
        userEmail: user.email,
        syncedAt: this.lastSync,
        storesCount: payload.metadata.stores_count,
        productsCount: payload.metadata.products_count
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Descarga el archivo de respaldo desde Google Drive
   */
  async downloadFromGoogleDrive() {
    const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
    if (!user || !user.email) {
      throw new Error('Debes iniciar sesión con tu cuenta de Google.');
    }

    const token = await this.getDriveAccessToken();
    const file = await this.findDriveBackupFile(token);

    if (!file || !file.id) {
      throw new Error('No se encontró ningún archivo de respaldo en tu Google Drive. Pulsa primero "Subir a Drive" en el otro dispositivo.');
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Error ${res.status} al descargar archivo desde Google Drive`);
    }

    const payload = await res.json();
    if (!payload.data || !Array.isArray(payload.data.stores)) {
      throw new Error('El archivo guardado en Google Drive no tiene un formato válido de Precios & Gastos.');
    }

    return {
      fileId: file.id,
      modifiedTime: file.modifiedTime,
      payload: payload
    };
  }

  /**
   * Realiza un respaldo instantáneo a Google Drive con la cuenta de Google activa
   */
  async syncToGoogleDrive() {
    return this.uploadToGoogleDrive();
  }
}

window.backupDrive = new BackupDriveService();
