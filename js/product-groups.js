// ====================================================
// SERVICIO DE AGRUPACIÓN DE PRODUCTOS (PRODUCT GROUPS)
// Control de Precios y Gastos PWA
// ====================================================

class ProductGroupingService {
  constructor() {
    this.STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'y', 'o', 'al', 'un', 'una', 'por']);
  }

  /**
   * Normaliza texto para comparaciones insensibles a mayúsculas, minúsculas y acentos.
   */
  normalize(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
      .replace(/[^\w\s]/g, ' ')         // Reemplazar signos de puntuación por espacios
      .replace(/\s+/g, ' ')             // Colapsar espacios múltiples
      .trim();
  }

  /**
   * Extrae los tokens de palabras de un texto normalizado.
   */
  tokenize(str) {
    return this.normalize(str).split(' ').filter(Boolean);
  }

  /**
   * Convierte un valor de peso a gramos para comparación numérica exacta.
   */
  parseWeight(str) {
    if (!str) return null;
    const m = String(str).toLowerCase().match(/([\d\.,]+)\s*(kg|kilos?|g\b|gr(?:amos)?|libras?|lbs?|lb\b|onzas?|oz\b)/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(',', '.'));
    if (isNaN(num)) return null;
    const unit = m[2];
    let grams = num;
    if (unit.startsWith('k')) grams = num * 1000;
    else if (unit.startsWith('l')) grams = num * 453.592;
    else if (unit.startsWith('o')) grams = num * 28.3495;
    return { original: String(str).trim(), grams };
  }

  /**
   * Convierte un valor de volumen a mililitros para comparación numérica exacta.
   */
  parseVolume(str) {
    if (!str) return null;
    const m = String(str).toLowerCase().match(/([\d\.,]+)\s*(litros?|lts?|l\b|ml|cc|galones?|gal\b)/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(',', '.'));
    if (isNaN(num)) return null;
    const unit = m[2];
    let ml = num;
    if (unit.startsWith('l')) ml = num * 1000;
    else if (unit.startsWith('gal')) ml = num * 3785.41;
    return { original: String(str).trim(), ml };
  }

  /**
   * Convierte una cantidad/combo a número para comparación.
   */
  parseQuantity(str) {
    if (!str) return null;
    const m = String(str).toLowerCase().match(/(\d+(?:[\.,]\d+)?)/);
    const num = m ? parseFloat(m[1].replace(',', '.')) : 1;
    return { original: String(str).trim(), count: isNaN(num) ? 1 : num };
  }

  /**
   * Obtiene el prefijo de palabras común entre dos listas de tokens.
   */
  getCommonPrefixTokens(tokensA, tokensB) {
    const common = [];
    const minLen = Math.min(tokensA.length, tokensB.length);
    for (let i = 0; i < minLen; i++) {
      if (tokensA[i] === tokensB[i]) {
        common.push(tokensA[i]);
      } else {
        break;
      }
    }
    // Quitar preposiciones sueltas al final (ej: ['jugo', 'de'] -> ['jugo'])
    while (common.length > 0 && this.STOP_WORDS.has(common[common.length - 1])) {
      common.pop();
    }
    return common;
  }

  /**
   * Da formato de título en mayúsculas/minúsculas correctas a una cadena de texto.
   */
  toTitleCase(str) {
    if (!str) return '';
    return str
      .split(' ')
      .filter(Boolean)
      .map((w, idx) => {
        const lower = w.toLowerCase();
        if (idx > 0 && this.STOP_WORDS.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  /**
   * Calcula los rangos de precio, peso, volumen y cantidad (min - max o único).
   */
  computeRanges(products, activeRate = 45.0, activeCurrency = 'USD') {
    if (!products || products.length === 0) {
      return {
        priceStr: '$ 0.00',
        weightStr: '',
        volumeStr: '',
        quantityStr: ''
      };
    }

    // 1. Rango de Precios
    const isVes = activeCurrency === 'VES';
    const pricesUsd = products.map(p => {
      let pUsd = parseFloat(p.current_price) || 0;
      if (p.original_currency === 'VES' && activeRate > 0) {
        pUsd = pUsd / activeRate;
      }
      return pUsd;
    });

    const minUsd = Math.min(...pricesUsd);
    const maxUsd = Math.max(...pricesUsd);

    let priceStr = '';
    if (isVes) {
      const minVes = minUsd * activeRate;
      const maxVes = maxUsd * activeRate;
      if (Math.abs(minVes - maxVes) < 0.01 || products.length === 1) {
        priceStr = `Bs. ${minVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        priceStr = `Bs. ${minVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Bs. ${maxVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    } else {
      if (Math.abs(minUsd - maxUsd) < 0.005 || products.length === 1) {
        priceStr = `$ ${minUsd.toFixed(2)}`;
      } else {
        priceStr = `$ ${minUsd.toFixed(2)} - $ ${maxUsd.toFixed(2)}`;
      }
    }

    // 2. Rango de Peso
    const parsedWeights = products.map(p => this.parseWeight(p.weight)).filter(Boolean);
    let weightStr = '';
    if (parsedWeights.length > 0) {
      parsedWeights.sort((a, b) => a.grams - b.grams);
      const minW = parsedWeights[0].original;
      const maxW = parsedWeights[parsedWeights.length - 1].original;
      if (minW.toLowerCase() === maxW.toLowerCase() || products.length === 1 || parsedWeights.length === 1) {
        weightStr = `⚖️ ${minW}`;
      } else {
        weightStr = `⚖️ ${minW} - ${maxW}`;
      }
    }

    // 3. Rango de Volumen
    const parsedVols = products.map(p => this.parseVolume(p.volume)).filter(Boolean);
    let volumeStr = '';
    if (parsedVols.length > 0) {
      parsedVols.sort((a, b) => a.ml - b.ml);
      const minV = parsedVols[0].original;
      const maxV = parsedVols[parsedVols.length - 1].original;
      if (minV.toLowerCase() === maxV.toLowerCase() || products.length === 1 || parsedVols.length === 1) {
        volumeStr = `🧴 ${minV}`;
      } else {
        volumeStr = `🧴 ${minV} - ${maxV}`;
      }
    }

    // 4. Rango de Cantidad / Combo
    const parsedQtys = products.map(p => this.parseQuantity(p.quantity)).filter(Boolean);
    let quantityStr = '';
    if (parsedQtys.length > 0) {
      parsedQtys.sort((a, b) => a.count - b.count);
      const minQ = parsedQtys[0].original;
      const maxQ = parsedQtys[parsedQtys.length - 1].original;
      if (minQ.toLowerCase() === maxQ.toLowerCase() || products.length === 1 || parsedQtys.length === 1) {
        quantityStr = `⚡ ${minQ}`;
      } else {
        quantityStr = `⚡ ${minQ} - ${maxQ}`;
      }
    }

    return {
      priceStr,
      weightStr,
      volumeStr,
      quantityStr,
      minUsd,
      maxUsd
    };
  }

  /**
   * Construye todos los grupos de productos combinando grupos manuales y agrupación automática por similitud.
   * @param {Array} products - Lista de productos en la base de datos
   * @param {Array} manualGroups - Grupos persistidos manualmente por el usuario
   * @param {number} activeRate - Tasa BCV actual
   * @param {string} activeCurrency - 'USD' o 'VES'
   */
  buildGroups(products, manualGroups = [], activeRate = 45.0, activeCurrency = 'USD') {
    if (!products || products.length === 0) return [];

    const assigned = new Map(); // productId -> groupId
    const clusters = [];

    // ----------------------------------------------------
    // PASO 1: APLICAR GRUPOS MANUALES PREEXISTENTES
    // ----------------------------------------------------
    for (const mg of manualGroups) {
      const mgNorm = this.normalize(mg.name);
      const keywords = (Array.isArray(mg.keywords) ? mg.keywords : (mg.keywords ? String(mg.keywords).split(',') : []))
        .map(k => this.normalize(k))
        .filter(Boolean);

      const explicitIds = new Set((mg.assigned_product_ids || []).map(id => parseInt(id, 10)));
      const groupProducts = [];

      for (const p of products) {
        if (assigned.has(p.id)) continue;
        const pNorm = this.normalize(p.name);

        const isExplicit = explicitIds.has(p.id);
        const matchesName = pNorm === mgNorm || pNorm.startsWith(mgNorm + ' ') || pNorm.includes(mgNorm);
        const matchesKeyword = keywords.some(k => k && (pNorm === k || pNorm.includes(k) || k.includes(pNorm)));

        if (isExplicit || matchesName || matchesKeyword) {
          groupProducts.push(p);
          assigned.set(p.id, mg.id);
        }
      }

      // Si tiene productos o fue creado por el usuario manualmente, agregarlo a la lista de clusters
      if (groupProducts.length > 0 || mg.manual) {
        const ranges = this.computeRanges(groupProducts, activeRate, activeCurrency);
        const uniqueStoreIds = Array.from(new Set(groupProducts.map(p => p.store_id).filter(Boolean)));
        clusters.push({
          id: mg.id,
          name: mg.name,
          isManual: true,
          savedGroup: mg,
          products: groupProducts,
          productCount: groupProducts.length,
          storeCount: uniqueStoreIds.length,
          storeIds: uniqueStoreIds,
          ...ranges
        });
      }
    }

    // ----------------------------------------------------
    // PASO 2: AGRUPACIÓN AUTOMÁTICA POR SIMILITUD DE NOMBRES
    // ----------------------------------------------------
    const unassigned = products.filter(p => !assigned.has(p.id));
    const unassignedNorm = unassigned.map(p => ({
      product: p,
      norm: this.normalize(p.name),
      tokens: this.tokenize(p.name)
    }));

    const visited = new Set();

    for (let i = 0; i < unassignedNorm.length; i++) {
      if (visited.has(i)) continue;
      const itemA = unassignedNorm[i];
      visited.add(i);

      const groupItems = [itemA.product];
      let bestCommonTokens = itemA.tokens;

      for (let j = i + 1; j < unassignedNorm.length; j++) {
        if (visited.has(j)) continue;
        const itemB = unassignedNorm[j];

        // 1. Coincidencia exacta de nombre normalizado (ignora mayúsculas/minúsculas)
        if (itemA.norm === itemB.norm) {
          groupItems.push(itemB.product);
          visited.add(j);
          continue;
        }

        // 2. Comprobación si uno es prefijo o subfrase completa de otro (ej: "manzana" y "manzana roja")
        const isAInB = itemB.norm.startsWith(itemA.norm + ' ');
        const isBInA = itemA.norm.startsWith(itemB.norm + ' ');

        if (isAInB || isBInA) {
          groupItems.push(itemB.product);
          visited.add(j);
          const shorter = isAInB ? itemA.tokens : itemB.tokens;
          if (shorter.length > 0 && shorter.length < bestCommonTokens.length) {
            bestCommonTokens = shorter;
          }
          continue;
        }

        // 3. Prefijo común de palabras (ej: "jugo de manzana apple plus" y "jugo de manzana manzanita")
        const commonPrefix = this.getCommonPrefixTokens(itemA.tokens, itemB.tokens);

        if (commonPrefix.length >= 2) {
          groupItems.push(itemB.product);
          visited.add(j);
          if (commonPrefix.length < bestCommonTokens.length) {
            bestCommonTokens = commonPrefix;
          }
        }
      }

      // Nombre del grupo automático
      let rawGroupName = bestCommonTokens.join(' ');
      let groupName = this.toTitleCase(rawGroupName) || itemA.product.name;

      const ranges = this.computeRanges(groupItems, activeRate, activeCurrency);
      const uniqueStoreIds = Array.from(new Set(groupItems.map(p => p.store_id).filter(Boolean)));

      clusters.push({
        id: 'auto_' + this.normalize(groupName).replace(/\s+/g, '_'),
        name: groupName,
        isManual: false,
        savedGroup: null,
        products: groupItems,
        productCount: groupItems.length,
        storeCount: uniqueStoreIds.length,
        storeIds: uniqueStoreIds,
        ...ranges
      });
    }

    // Ordenar grupos alfabéticamente
    clusters.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    return clusters;
  }

  // ----------------------------------------------------
  // GESTIÓN PERSISTENTE DE GRUPOS MANUALES
  // ----------------------------------------------------

  async getSavedGroups() {
    if (!window.db) return [];
    return await window.db.getProductGroups();
  }

  async createManualGroup({ name, keywords = [], productIds = [] }) {
    if (!window.db) throw new Error('Base de datos no inicializada');
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre del grupo es obligatorio');

    const kwArray = Array.isArray(keywords)
      ? keywords.map(k => String(k).trim()).filter(Boolean)
      : String(keywords).split(',').map(k => k.trim()).filter(Boolean);

    const groupPayload = {
      name: cleanName,
      keywords: kwArray,
      assigned_product_ids: Array.from(new Set(productIds.map(id => parseInt(id, 10)).filter(Boolean))),
      manual: true
    };

    return await window.db.saveProductGroup(groupPayload);
  }

  async updateGroupProducts(groupId, productIds) {
    if (!window.db) return;
    const isAuto = String(groupId).startsWith('auto_');
    const numericIds = Array.from(new Set(productIds.map(id => parseInt(id, 10)).filter(Boolean)));

    if (isAuto) {
      // Convertir un grupo automático en manual para persistir sus ediciones
      const autoName = String(groupId).replace(/^auto_/, '').replace(/_/g, ' ');
      const titleName = this.toTitleCase(autoName);
      return await window.db.saveProductGroup({
        name: titleName,
        keywords: [autoName],
        assigned_product_ids: numericIds,
        manual: true
      });
    } else {
      const existing = await window.db.getProductGroupById(groupId);
      if (!existing) return;
      existing.assigned_product_ids = numericIds;
      existing.manual = true;
      return await window.db.saveProductGroup(existing);
    }
  }

  async addProductToGroup(groupId, productId) {
    if (!productId) return;
    const isAuto = String(groupId).startsWith('auto_');
    if (isAuto) {
      // Necesita crear manual con este producto
      return await this.updateGroupProducts(groupId, [productId]);
    } else {
      const group = await window.db.getProductGroupById(groupId);
      if (!group) return;
      const ids = new Set(group.assigned_product_ids || []);
      ids.add(parseInt(productId, 10));
      group.assigned_product_ids = Array.from(ids);
      group.manual = true;
      return await window.db.saveProductGroup(group);
    }
  }

  async removeProductFromGroup(groupId, productId, allCurrentProductIds = []) {
    if (!productId) return;
    const pid = parseInt(productId, 10);
    const isAuto = String(groupId).startsWith('auto_');

    if (isAuto) {
      // Si era automático, lo persistimos excluyendo el producto removido
      const remainingIds = allCurrentProductIds.filter(id => parseInt(id, 10) !== pid);
      return await this.updateGroupProducts(groupId, remainingIds);
    } else {
      const group = await window.db.getProductGroupById(groupId);
      if (!group) return;
      group.assigned_product_ids = (group.assigned_product_ids || []).filter(id => parseInt(id, 10) !== pid);
      return await window.db.saveProductGroup(group);
    }
  }

  async renameGroup(groupId, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) return;
    const isAuto = String(groupId).startsWith('auto_');
    if (isAuto) {
      return await window.db.saveProductGroup({
        name: cleanName,
        keywords: [cleanName],
        assigned_product_ids: [],
        manual: true
      });
    } else {
      const group = await window.db.getProductGroupById(groupId);
      if (!group) return;
      group.name = cleanName;
      return await window.db.saveProductGroup(group);
    }
  }

  async deleteGroup(groupId) {
    if (String(groupId).startsWith('auto_')) return true;
    return await window.db.deleteProductGroup(groupId);
  }
}

// Instancia global del servicio
window.productGroupingService = new ProductGroupingService();
