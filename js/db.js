// IndexedDB Engine for "Control de Precios y Gastos"
const DB_NAME = 'ControlPreciosGastosDB';
const DB_VERSION = 2;

class AppDB {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Stores (Tiendas)
        if (!db.objectStoreNames.contains('stores')) {
          const storeOS = db.createObjectStore('stores', { keyPath: 'id', autoIncrement: true });
          storeOS.createIndex('name', 'name', { unique: false });
        }

        // Products (Productos)
        if (!db.objectStoreNames.contains('products')) {
          const prodOS = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          prodOS.createIndex('store_id', 'store_id', { unique: false });
          prodOS.createIndex('name', 'name', { unique: false });
          prodOS.createIndex('store_and_name', ['store_id', 'name'], { unique: false });
        }

        // Price History (Historial de precios con fechas)
        if (!db.objectStoreNames.contains('price_history')) {
          const histOS = db.createObjectStore('price_history', { keyPath: 'id', autoIncrement: true });
          histOS.createIndex('product_id', 'product_id', { unique: false });
          histOS.createIndex('date', 'date', { unique: false });
        }

        // Invoices (Facturas registradas con foto comprimida)
        if (!db.objectStoreNames.contains('invoices')) {
          const invOS = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
          invOS.createIndex('store_id', 'store_id', { unique: false });
          invOS.createIndex('date', 'date', { unique: false });
        }

        // Expenses (Contabilidad / Registro de gastos)
        if (!db.objectStoreNames.contains('expenses')) {
          const expOS = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          expOS.createIndex('date', 'date', { unique: false });
          expOS.createIndex('category', 'category', { unique: false });
          expOS.createIndex('invoice_id', 'invoice_id', { unique: false });
        }

        // Settings (Configuraciones generales)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Groups (Grupos compartidos / Familias)
        if (!db.objectStoreNames.contains('groups')) {
          const grpOS = db.createObjectStore('groups', { keyPath: 'id' });
          grpOS.createIndex('owner_email', 'owner_email', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async _tx(storeNames, mode = 'readonly') {
    await this.ready;
    return this.db.transaction(storeNames, mode);
  }

  // Generic Helpers
  async getAll(storeName) {
    const tx = await this._tx(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getById(storeName, id) {
    const tx = await this._tx(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async add(storeName, item) {
    const tx = await this._tx(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, item) {
    const tx = await this._tx(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, id) {
    const tx = await this._tx(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(storeName) {
    const tx = await this._tx(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Specific Store Operations ---

  // Stores
  async getStores(workspaceId = null) {
    const all = await this.getAll('stores');
    if (workspaceId === 'ALL') return all;
    const targetWs = workspaceId || (window.authGroups ? window.authGroups.getActiveWorkspaceId() : 'personal');
    return all.filter(s => (s.workspace_id || 'personal') === targetWs);
  }

  async findStoreByName(name, workspaceId = null) {
    const stores = await this.getStores(workspaceId);
    const clean = name.trim().toLowerCase();
    return stores.find(s => s.name.trim().toLowerCase() === clean);
  }

  async findStoreByNameInWorkspace(name, workspaceId = 'personal') {
    return this.findStoreByName(name, workspaceId);
  }

  async saveStore(storeData) {
    const now = new Date().toISOString();
    if (!storeData.workspace_id) {
      storeData.workspace_id = window.authGroups ? window.authGroups.getActiveWorkspaceId() : 'personal';
    }
    if (storeData.id) {
      storeData.updated_at = now;
      await this.put('stores', storeData);
      return storeData.id;
    } else {
      storeData.created_at = now;
      storeData.updated_at = now;
      return this.add('stores', storeData);
    }
  }

  async deleteStore(storeId) {
    // Delete store, its products, and associated price history
    const products = await this.getProductsByStore(storeId);
    for (const p of products) {
      await this.deleteProduct(p.id);
    }
    return this.delete('stores', storeId);
  }

  // Products
  async getProducts(workspaceId = null) {
    const all = await this.getAll('products');
    if (workspaceId === 'ALL') return all;
    const targetWs = workspaceId || (window.authGroups ? window.authGroups.getActiveWorkspaceId() : 'personal');
    return all.filter(p => (p.workspace_id || 'personal') === targetWs);
  }

  async getProductsByStore(storeId) {
    const tx = await this._tx('products', 'readonly');
    const store = tx.objectStore('products');
    const index = store.index('store_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(storeId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async findProductByStoreAndName(storeId, productName) {
    const products = await this.getProductsByStore(storeId);
    const clean = productName.trim().toLowerCase();
    return products.find(p => p.name.trim().toLowerCase() === clean);
  }

  async saveProduct(productData, priceHistorySource = 'MANUAL', bcvRate = null) {
    const now = new Date().toISOString();
    if (!productData.workspace_id) {
      productData.workspace_id = window.authGroups ? window.authGroups.getActiveWorkspaceId() : 'personal';
    }
    // Asegurar imagen/icono obligatorio
    if (!productData.image_type) productData.image_type = 'icon';
    if (!productData.image_data) productData.image_data = 'general';

    // Regla: si el producto no tiene rating, verificar si existe otro producto con el mismo nombre y misma foto/icono para heredar sus estrellas
    if (productData.rating === undefined || productData.rating === null) {
      const match = await this.findMatchingSharedProduct(productData.name, productData.image_type, productData.image_data);
      if (match && match.rating) {
        productData.rating = match.rating;
      }
    }

    let productId = productData.id;
    let isNew = !productId;

    if (productId) {
      productData.updated_at = now;
      await this.put('products', productData);
    } else {
      productData.created_at = now;
      productData.updated_at = now;
      productId = await this.add('products', productData);
      productData.id = productId;
    }

    // Always register price history point
    if (productData.current_price !== undefined && productData.current_price !== null) {
      await this.addPriceHistory({
        product_id: productId,
        store_id: productData.store_id,
        price: parseFloat(productData.current_price),
        currency: productData.original_currency || 'USD',
        bcv_rate: bcvRate,
        date: productData.updated_at || now,
        source: priceHistorySource
      });
    }

    // Sincronizar calificación con productos hermanos si se proporcionó una
    if (productData.rating) {
      await this.updateProductRatingShared(productId, productData.rating);
    }

    return productData;
  }

  /**
   * Actualiza la valoración de estrellas de un producto y la comparte con TODOS los productos
   * que tengan el MISMO nombre y la MISMA foto o icono en cualquier tienda
   */
  async updateProductRatingShared(productId, newRating) {
    const prod = await this.getById('products', productId);
    if (!prod) return 0;

    const val = (newRating && parseInt(newRating) > 0) ? parseInt(newRating) : null;
    prod.rating = val;
    await this.put('products', prod);

    const allProds = await this.getAll('products');
    const cleanName = (prod.name || '').trim().toLowerCase();
    const prodImgType = prod.image_type || 'icon';
    const prodImgData = prod.image_data || 'general';

    let updatedCount = 1;
    for (const p of allProds) {
      if (p.id !== prod.id) {
        const pClean = (p.name || '').trim().toLowerCase();
        const pImgType = p.image_type || 'icon';
        const pImgData = p.image_data || 'general';

        // Regla estricta: Mismo nombre Y Misma foto/icono
        if (pClean === cleanName && pImgType === prodImgType && pImgData === prodImgData) {
          p.rating = val;
          await this.put('products', p);
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }

  async findMatchingSharedProduct(name, imageType, imageData) {
    const allProds = await this.getAll('products');
    const cleanName = (name || '').trim().toLowerCase();
    const imgType = imageType || 'icon';
    const imgData = imageData || 'general';

    return allProds.find(p => {
      const pClean = (p.name || '').trim().toLowerCase();
      const pType = p.image_type || 'icon';
      const pData = p.image_data || 'general';
      return pClean === cleanName && pType === imgType && pData === imgData && p.rating;
    });
  }

  // --- Groups (Grupos Compartidos / Familias) ---
  async getGroups() {
    return this.getAll('groups');
  }

  async getGroupById(id) {
    return this.getById('groups', id);
  }

  async saveGroup(groupData) {
    const now = new Date().toISOString();
    groupData.updated_at = now;
    if (!groupData.created_at) groupData.created_at = now;
    await this.put('groups', groupData);
    return groupData.id;
  }

  async deleteGroup(id) {
    const groupStores = await this.getStores(id);
    for (const s of groupStores) {
      await this.deleteStore(s.id);
    }
    return this.delete('groups', id);
  }

  async deleteProduct(productId) {
    // Delete product and its price history
    const history = await this.getPriceHistory(productId);
    for (const h of history) {
      await this.delete('price_history', h.id);
    }
    return this.delete('products', productId);
  }

  // Price History
  async getPriceHistory(productId) {
    const tx = await this._tx('price_history', 'readonly');
    const store = tx.objectStore('price_history');
    const index = store.index('product_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(productId);
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => new Date(a.date) - new Date(b.date));
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async addPriceHistory(historyEntry) {
    if (!historyEntry.date) {
      historyEntry.date = new Date().toISOString();
    }
    return this.add('price_history', historyEntry);
  }

  // Invoices
  async getInvoices() {
    const items = await this.getAll('invoices');
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async saveInvoice(invoiceData) {
    const now = new Date().toISOString();
    invoiceData.created_at = now;
    const invId = await this.add('invoices', invoiceData);
    invoiceData.id = invId;
    return invoiceData;
  }

  // Expenses (Contabilidad)
  async getExpenses() {
    const items = await this.getAll('expenses');
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async saveExpense(expenseData) {
    const now = new Date().toISOString();
    if (expenseData.id) {
      expenseData.updated_at = now;
      await this.put('expenses', expenseData);
      return expenseData.id;
    } else {
      expenseData.created_at = now;
      return this.add('expenses', expenseData);
    }
  }

  // Settings
  async getSetting(key, defaultValue = null) {
    const item = await this.getById('settings', key);
    return item ? item.value : defaultValue;
  }

  async setSetting(key, value) {
    return this.put('settings', { key, value, updated_at: new Date().toISOString() });
  }

  // Limpia completamente la base de datos para una instalación limpia (0 tiendas, 0 productos, 0 gastos)
  async clearAllPersonalData() {
    await this.clear('stores');
    await this.clear('products');
    await this.clear('price_history');
    await this.clear('expenses');
    await this.clear('invoices');
    await this.setSetting('app_clean_install', true);
    console.log('Base de datos reseteada a instalación limpia (0 datos preestablecidos).');
    return true;
  }

  // Seed Initial Demo Data (so app is never empty on first load)
  async seedInitialDataIfEmpty(currentBcvRate = 45.0) {
    const stores = await this.getStores();
    if (stores.length > 0) return; // already seeded

    console.log('Inicializando datos de muestra en la base de datos local...');
    
    // Store 1: Automercados Plaza's
    const store1Id = await this.add('stores', {
      workspace_id: 'personal',
      name: "Automercados Plaza's",
      image_type: 'icon',
      image_data: 'supermarket',
      maps_url: "https://maps.google.com/?q=Automercados+Plazas+Caracas",
      lat: 10.4910,
      lng: -66.8530,
      description: "Sucursal Los Palos Grandes. Variedad y productos importados.",
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });

    // Store 2: Farmatodo
    const store2Id = await this.add('stores', {
      workspace_id: 'personal',
      name: "Farmatodo",
      image_type: 'icon',
      image_data: 'pharmacy',
      maps_url: "https://maps.google.com/?q=Farmatodo+Las+Mercedes",
      lat: 10.4820,
      lng: -66.8610,
      description: "Sucursal Las Mercedes 24 Horas.",
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });

    // Store 3: Excelsior Gama
    const store3Id = await this.add('stores', {
      workspace_id: 'personal',
      name: "Excelsior Gama",
      image_type: 'icon',
      image_data: 'supermarket',
      maps_url: "https://maps.google.com/?q=Excelsior+Gama+La+Trinidad",
      lat: 10.4350,
      lng: -66.8550,
      description: "Sucursal La Trinidad. Excelentes víveres y charcutería.",
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });

    // Products & Price History for Store 1
    const p1Id = await this.add('products', {
      workspace_id: 'personal',
      store_id: store1Id,
      name: "Harina PAN 1kg",
      image_type: 'icon',
      image_data: 'grain',
      current_price: 1.25,
      original_currency: "USD",
      rating: 5,
      description: "Harina de maíz blanco precocida tradicional.",
      created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    // History points showing price trend
    await this.add('price_history', { product_id: p1Id, store_id: store1Id, price: 1.10, currency: "USD", bcv_rate: 40.2, date: new Date(Date.now() - 40 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p1Id, store_id: store1Id, price: 1.15, currency: "USD", bcv_rate: 42.0, date: new Date(Date.now() - 25 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p1Id, store_id: store1Id, price: 1.20, currency: "USD", bcv_rate: 43.5, date: new Date(Date.now() - 10 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p1Id, store_id: store1Id, price: 1.25, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    const p2Id = await this.add('products', {
      workspace_id: 'personal',
      store_id: store1Id,
      name: "Café Fama de América 500g",
      image_type: 'icon',
      image_data: 'coffee',
      current_price: 4.50,
      original_currency: "USD",
      rating: 4,
      description: "Tostado y molido gourmet.",
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p2Id, store_id: store1Id, price: 4.80, currency: "USD", bcv_rate: 41.5, date: new Date(Date.now() - 30 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p2Id, store_id: store1Id, price: 4.50, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    const p3Id = await this.add('products', {
      workspace_id: 'personal',
      store_id: store1Id,
      name: "Aceite de Maíz Mazeite 1L",
      image_type: 'icon',
      image_data: 'produce',
      current_price: 3.80,
      original_currency: "USD",
      rating: 5,
      description: "Aceite vegetal 100% puro de maíz.",
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p3Id, store_id: store1Id, price: 3.60, currency: "USD", bcv_rate: 42.0, date: new Date(Date.now() - 20 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p3Id, store_id: store1Id, price: 3.80, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    // Store 2 Products (Farmatodo)
    const p4Id = await this.add('products', {
      workspace_id: 'personal',
      store_id: store2Id,
      name: "Harina PAN 1kg",
      image_type: 'icon',
      image_data: 'grain',
      current_price: 1.35,
      original_currency: "USD",
      rating: 5, // Misma calificación compartida que Store 1 por tener mismo nombre y misma foto
      description: "Harina de maíz blanco precocida.",
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p4Id, store_id: store2Id, price: 1.35, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'TABLA' });

    const p5Id = await this.add('products', {
      workspace_id: 'personal',
      store_id: store2Id,
      name: "Leche Completa La Pastoreña 1L",
      image_type: 'icon',
      image_data: 'dairy',
      current_price: 2.10,
      original_currency: "USD",
      rating: 5,
      description: "Leche líquida UHT entera.",
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p5Id, store_id: store2Id, price: 1.95, currency: "USD", bcv_rate: 42.0, date: new Date(Date.now() - 25 * 86400000).toISOString(), source: 'FACTURA' });
    await this.add('price_history', { product_id: p5Id, store_id: store2Id, price: 2.10, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    // Store 3 Products (Excelsior Gama)
    const p6Id = await this.add('products', {
      store_id: store3Id,
      name: "Harina PAN 1kg",
      current_price: 1.18,
      original_currency: "USD",
      rating: 5,
      description: "Harina de maíz tradicional.",
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p6Id, store_id: store3Id, price: 1.18, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    const p7Id = await this.add('products', {
      store_id: store3Id,
      name: "Café Fama de América 500g",
      current_price: 4.20,
      original_currency: "USD",
      rating: 4,
      description: "Café molido clásico.",
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p7Id, store_id: store3Id, price: 4.20, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    const p8Id = await this.add('products', {
      store_id: store3Id,
      name: "Aceite de Maíz Mazeite 1L",
      current_price: 3.65,
      original_currency: "USD",
      rating: 5,
      description: "Aceite vegetal 1L.",
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.add('price_history', { product_id: p8Id, store_id: store3Id, price: 3.65, currency: "USD", bcv_rate: currentBcvRate, date: new Date().toISOString(), source: 'FACTURA' });

    // Sample Invoices
    const inv1Id = await this.add('invoices', {
      store_id: store1Id,
      store_name: "Automercados Plaza's",
      date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      total_usd: 9.55,
      total_ves: 9.55 * currentBcvRate,
      bcv_rate: currentBcvRate,
      items_count: 3,
      items_json: [
        { name: "Harina PAN 1kg", price: 1.25, quantity: 1, total: 1.25 },
        { name: "Café Fama de América 500g", price: 4.50, quantity: 1, total: 4.50 },
        { name: "Aceite de Maíz Mazeite 1L", price: 3.80, quantity: 1, total: 3.80 }
      ],
      photo_compressed_base64: null, // placeholder
      photo_size_bytes: 28540,
      original_size_bytes: 4890000,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    });

    // Sample Expenses
    await this.add('expenses', {
      invoice_id: inv1Id,
      date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      concept: "Compra víveres en Automercados Plaza's",
      category: "Alimentos / Mercado",
      amount_usd: 9.55,
      amount_ves: 9.55 * currentBcvRate,
      original_currency: "USD",
      bcv_rate: currentBcvRate,
      source: "FACTURA",
      note: "Factura procesada automáticamente",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    });

    await this.add('expenses', {
      invoice_id: null,
      date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
      concept: "Pasaje camionetica y metro",
      category: "Transporte",
      amount_usd: 1.50,
      amount_ves: 1.50 * currentBcvRate,
      original_currency: "VES",
      bcv_rate: currentBcvRate,
      source: "MANUAL",
      note: "Pago en efectivo en Bolívares",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString()
    });

    await this.add('expenses', {
      invoice_id: null,
      date: new Date().toISOString().split('T')[0],
      concept: "Farmacia vitaminas y analgésicos",
      category: "Salud / Farmacia",
      amount_usd: 6.80,
      amount_ves: 6.80 * currentBcvRate,
      original_currency: "USD",
      bcv_rate: currentBcvRate,
      source: "MANUAL",
      note: "Gasto manual personal",
      created_at: new Date().toISOString()
    });

    console.log('Datos iniciales de muestra cargados con éxito.');
  }
}

// Global Singleton
window.db = new AppDB();
