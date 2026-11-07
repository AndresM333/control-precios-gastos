// ====================================================
// UTILIDADES GLOBALES PARA ATRIBUTOS DE PRODUCTOS
// (Separación de Nombre, Cantidad/Combo, Peso y Volumen)
// ====================================================
function escapeProductHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.ProductUtils = {
  sanitizeProductAttributes(rawName, existingWeight = null, existingVolume = null, existingQuantity = null) {
    let name = (rawName || '').trim();
    let weight = (existingWeight !== null && existingWeight !== undefined && String(existingWeight).trim()) ? String(existingWeight).trim() : null;
    let volume = (existingVolume !== null && existingVolume !== undefined && String(existingVolume).trim()) ? String(existingVolume).trim() : null;
    let quantity = (existingQuantity !== null && existingQuantity !== undefined && String(existingQuantity).trim()) ? String(existingQuantity).trim() : null;

    if (quantity === '1' || quantity === '1.0' || quantity === '1.00') {
      quantity = null;
    }

    // 1. Detectar combos o cantidades en el nombre (ej: '2x', 'Combo 2x', 'Combo 2', 'Pack de 6', 'Pack 6', '6 pack', '3 unid', '12 unidades')
    const qtyRegex = /(?:\bcombo\s*(?:x\s*)?\d+\s*x?|\b(\d+\s*x|\bpack\s*(?:de\s*)?\d+|\d+\s*(?:pack|unid(?:ades|s)?|piezas?|pzas?|u\b))\b)/i;
    const qtyMatch = name.match(qtyRegex);
    if (qtyMatch && !quantity) {
      quantity = qtyMatch[0].trim();
      name = name.replace(qtyMatch[0], ' ');
    }

    // 2. Detectar volumen (ej: '1.5L', '1,5 L', '355ml', '500 cc', '2 litros', '1 gal')
    const volRegex = /\b(\d+(?:[\.,]\d+)?\s*(?:litros?|lts?|l\b|ml|cc|galones?|gal\b))\b/i;
    const volMatch = name.match(volRegex);
    if (volMatch && !volume) {
      volume = volMatch[0].trim();
      name = name.replace(volMatch[0], ' ');
    }

    // 3. Detectar peso (ej: '400g', '400 gr', '1kg', '1.5 kg', '2 lb', '16 oz', '1/2 kg')
    const weightRegex = /\b(\d+(?:[\.,]\d+)?\s*(?:kilos?|kg|gr(?:amos|s)?|g\b|libras?|lbs?|lb\b|onzas?|oz\b)|\d+\/\d+\s*(?:kg|kilos?|g|gr))\b/i;
    const weightMatch = name.match(weightRegex);
    if (weightMatch && !weight) {
      weight = weightMatch[0].trim();
      name = name.replace(weightMatch[0], ' ');
    }

    // Limpiar separadores sobrantes al inicio/final o paréntesis vacíos
    name = name.replace(/[\(\)\[\]]/g, ' ')
      .replace(/\s*[-–—\/•,]+\s*$/g, '')
      .replace(/^\s*[-–—\/•,]+\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      name: name || rawName,
      weight: weight || null,
      volume: volume || null,
      quantity: quantity || null
    };
  },

  /**
   * Detecta si un nombre de producto contiene peso, volumen o cantidad incrustados.
   * Retorna null si el nombre está limpio, o un objeto con los detalles detectados.
   */
  detectAttributesInName(rawName) {
    if (!rawName) return null;
    const name = String(rawName).trim();
    if (!name) return null;

    const qtyRegex = /(?:\bcombo\s*(?:x\s*)?\d+\s*x?|\b(\d+\s*x|\bpack\s*(?:de\s*)?\d+|\d+\s*(?:pack|unid(?:ades|s)?|piezas?|pzas?|u\b))\b)/i;
    const volRegex = /\b(\d+(?:[\.,]\d+)?\s*(?:litros?|lts?|l\b|ml|cc|galones?|gal\b))\b/i;
    const weightRegex = /\b(\d+(?:[\.,]\d+)?\s*(?:kilos?|kg|gr(?:amos|s)?|g\b|libras?|lbs?|lb\b|onzas?|oz\b)|\d+\/\d+\s*(?:kg|kilos?|g|gr))\b/i;

    const qtyMatch = name.match(qtyRegex);
    const volMatch = name.match(volRegex);
    const weightMatch = name.match(weightRegex);

    if (!qtyMatch && !volMatch && !weightMatch) {
      return null;
    }

    const detected = [];
    if (qtyMatch) {
      detected.push({
        type: 'quantity',
        label: 'Cantidad / Combo',
        icon: '⚡',
        value: qtyMatch[0].trim(),
        fieldId: 'inputProductQuantity',
        fieldLabel: '⚡ Cantidad / Pack'
      });
    }
    if (volMatch) {
      detected.push({
        type: 'volume',
        label: 'Volumen',
        icon: '🧴',
        value: volMatch[0].trim(),
        fieldId: 'inputProductVolume',
        fieldLabel: '🧴 Volumen'
      });
    }
    if (weightMatch) {
      detected.push({
        type: 'weight',
        label: 'Peso',
        icon: '⚖️',
        value: weightMatch[0].trim(),
        fieldId: 'inputProductWeight',
        fieldLabel: '⚖️ Peso'
      });
    }

    const sanitized = this.sanitizeProductAttributes(name);

    return {
      hasSpecs: true,
      detected,
      cleanName: sanitized.name,
      suggestedQty: sanitized.quantity,
      suggestedWeight: sanitized.weight,
      suggestedVolume: sanitized.volume
    };
  },

  formatTitleWithQuantity(prod, extraClass = '') {
    if (!prod) return '';
    const name = prod.name || '';
    const rawQty = prod.quantity ? String(prod.quantity).trim() : '';
    const hasSpecialQty = rawQty && rawQty !== '1' && rawQty !== '1.0';
    const qtyBadge = hasSpecialQty
      ? `<span class="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded-md bg-amber-500/20 text-amber-300 font-black text-[10px] sm:text-xs border border-amber-500/40 uppercase tracking-tight shadow-sm align-middle flex-shrink-0">⚡ ${escapeProductHtml(rawQty)}</span>`
      : '';
    return `${qtyBadge}<span class="align-middle ${extraClass}">${escapeProductHtml(name)}</span>`;
  },

  formatSpecsBadge(prod) {
    if (!prod) return '';
    const specs = [];
    if (prod.weight && String(prod.weight).trim()) specs.push(`⚖️ ${escapeProductHtml(String(prod.weight).trim())}`);
    if (prod.volume && String(prod.volume).trim()) specs.push(`🧴 ${escapeProductHtml(String(prod.volume).trim())}`);
    if (specs.length === 0) return '';
    return `<span class="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1">${specs.join(' <span class="text-slate-600">•</span> ')}</span>`;
  },

  formatStoreBadge(store, maxChars = 14) {
    if (!store || !store.name) return '';
    const fullName = String(store.name).trim();
    if (!fullName) return '';
    const truncatedName = fullName.length > maxChars ? fullName.slice(0, maxChars).trim() + '…' : fullName;

    let iconHtml = '';
    if (store.image_type === 'photo' && store.image_data) {
      iconHtml = `<img src="${store.image_data}" class="w-3 h-3 rounded object-cover flex-shrink-0" alt="">`;
    } else {
      const iconId = store.image_data || 'supermarket';
      const def = (window.AppIcons && window.AppIcons.stores && window.AppIcons.stores[iconId]) || {
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
        color: '#60a5fa'
      };
      iconHtml = `<span class="w-3 h-3 flex items-center justify-center flex-shrink-0" style="color: ${def.color};">${def.svg}</span>`;
    }

    return `
      <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded border border-blue-500/25 max-w-[130px] truncate" title="Tienda: ${escapeProductHtml(fullName)}">
        ${iconHtml}
        <span class="truncate">${escapeProductHtml(truncatedName)}</span>
      </span>
    `;
  }
};

// Servicio de Escaneo Inteligente con IA (Google Gemini Flash & Gemini Pro)
class AIScannerService {
  constructor() {
    this.modelTier = 'flash'; // 'flash' (Gratuito / Rápido) o 'pro' (Clase Especial / Mayor Nivel)
    this.tierModels = {
      flash: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash'],
      pro: ['gemini-3.8-pro', 'gemini-2.5-pro', 'gemini-pro']
    };
    this.defaultModel = 'gemini-3.8-flash';
    this.cachedDiscoveredModels = null;
  }

  async getApiKey() {
    return await window.db.getSetting('gemini_api_key', '');
  }

  async setApiKey(key) {
    this.cachedDiscoveredModels = null;
    return await window.db.setSetting('gemini_api_key', key.trim());
  }

  async removeApiKey() {
    this.cachedDiscoveredModels = null;
    return await window.db.setSetting('gemini_api_key', '');
  }

  async getModelTier() {
    const saved = await window.db.getSetting('gemini_model_tier', 'flash');
    this.modelTier = saved === 'pro' ? 'pro' : 'flash';
    return this.modelTier;
  }

  async setModelTier(tier) {
    const validTier = tier === 'pro' ? 'pro' : 'flash';
    this.modelTier = validTier;
    await window.db.setSetting('gemini_model_tier', validTier);
    this.defaultModel = this.tierModels[validTier][0];
    return validTier;
  }

  /**
   * Consulta a Google la lista oficial y activa de modelos disponibles para esta API Key
   * Endpoint oficial de Google AI Studio: GET /v1beta/models?key=...
   */
  async discoverModels(customKey = null) {
    const key = (customKey !== null ? customKey : await this.getApiKey() || '').trim();
    if (!key) return null;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const response = await fetch(endpoint, { method: 'GET' });
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.models || !Array.isArray(data.models)) return null;

      // Filtrar únicamente los modelos que soportan generateContent y procesan contenido visual/texto
      const validModels = data.models
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(name => !name.includes('embedding') && !name.includes('aqa') && !name.includes('imagen') && !name.includes('tts'));

      if (validModels.length === 0) return null;

      const flash = validModels.filter(n => n.toLowerCase().includes('flash'));
      const pro = validModels.filter(n => n.toLowerCase().includes('pro'));
      const others = validModels.filter(n => !n.toLowerCase().includes('flash') && !n.toLowerCase().includes('pro'));

      // Ordenar con versiones más recientes primero (3.8 > 2.5, etc.)
      const sortFn = (a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
      flash.sort(sortFn);
      pro.sort(sortFn);

      const result = {
        flash: flash.length > 0 ? flash : ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash'],
        pro: pro.length > 0 ? pro : ['gemini-3.8-pro', 'gemini-2.5-pro', 'gemini-pro'],
        all: [...pro, ...flash, ...others]
      };

      this.cachedDiscoveredModels = result;
      return result;
    } catch (err) {
      console.warn('No se pudo listar modelos dinámicamente desde Google:', err);
      return null;
    }
  }

  async getCandidateModels(apiKey = null) {
    const tier = await this.getModelTier();

    // Intentar obtener los modelos dinámicamente de Google si no los tenemos en caché
    let models = this.cachedDiscoveredModels;
    if (!models) {
      const key = apiKey || await this.getApiKey();
      if (key) {
        models = await this.discoverModels(key);
      }
    }

    if (models) {
      const primary = tier === 'pro' ? models.pro : models.flash;
      const fallback = tier === 'pro' ? models.flash : models.pro;
      return Array.from(new Set([...primary, ...fallback, ...models.all]));
    }

    // Lista estática segura sin modelos obsoletos/retirados
    const defaultFlash = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash'];
    const defaultPro = ['gemini-3.8-pro', 'gemini-2.5-pro', 'gemini-pro'];

    const primary = tier === 'pro' ? defaultPro : defaultFlash;
    const fallback = tier === 'pro' ? defaultFlash : defaultPro;
    return Array.from(new Set([this.defaultModel, ...primary, ...fallback]));
  }

  /**
   * Prueba una clave API contra el endpoint oficial de Gemini
   * @param {string|null} customKey - Clave opcional para probar antes de guardar
   * @returns {Promise<{ok: boolean, model: string, tier: string}>}
   */
  async testApiKey(customKey = null) {
    const key = (customKey !== null ? customKey : await this.getApiKey() || '').trim();
    if (!key) {
      throw new Error('No hay ninguna clave API ingresada para probar.');
    }

    // Descubrir los modelos oficiales soportados por esta clave
    await this.discoverModels(key);

    const candidateModels = await this.getCandidateModels(key);
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(key)}`;
        const response = await fetch(endpoint, { method: 'GET' });

        if (!response.ok) {
          const errText = await response.text();
          let msg = `Error (${response.status}): Clave no válida o sin permisos`;
          try {
            const errObj = JSON.parse(errText);
            if (errObj.error && errObj.error.message) {
              msg = errObj.error.message;
            }
          } catch (e) {}

          const isUnavailable = response.status === 404 || response.status === 503 || response.status === 429 ||
            msg.includes('no longer available') || msg.includes('not found') || msg.includes('not supported') ||
            msg.includes('high demand') || msg.includes('overloaded');

          if (isUnavailable) {
            lastError = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        this.defaultModel = model;
        return {
          ok: true,
          model: data.displayName || data.name || model,
          tier: this.modelTier
        };
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        const isRetryable = msg.includes('no longer available') || msg.includes('not found') || msg.includes('not supported') ||
          msg.includes('404') || msg.includes('high demand') || msg.includes('503') || msg.includes('429') || msg.includes('overloaded');
        if (isRetryable) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('No se pudo verificar la clave con los modelos disponibles.');
  }

  /**
   * Deduce el icono temático de producto más apropiado según el nombre y sugerencia
   * @param {string} name 
   * @param {string} categoryHint
   * @returns {string} ID del icono en AppIcons.products
   */
  guessProductIcon(name, categoryHint = '') {
    const validIcons = ['restaurant', 'bakery', 'coffee', 'meat', 'dairy', 'produce', 'grain', 'canned', 'snack', 'cleaning', 'hygiene', 'pharmacy', 'general'];
    if (categoryHint && typeof categoryHint === 'string') {
      const hint = categoryHint.toLowerCase().trim();
      if (validIcons.includes(hint)) return hint;
    }

    if (!name || typeof name !== 'string') return 'general';
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Platos preparados / Restaurante / Comida rápida
    if (/(hamburguesa|burger|pizza|perro caliente|hot dog|pepito|shawarma|sushi|plato|combo|almuerzo|cena|desayuno|wrap|club house|pasticho|lasana|parrilla|sopa|hervido|racion|tostones|alitas|pollo asado|pollo frito|crepe|taco|burrito|chuzo|arepa|cachapa|empanada de|pastelito de)/.test(n)) {
      return 'restaurant';
    }
    // Panadería / Repostería / Masas / Desayunos
    if (/(pan|panaderia|baguette|canilla|campesino|croissant|donut|dona|galleta|pastel|torta|hojaldre|empanada|tequeno|pastelito|ponque|bizcocho|waffle|brownie|muffin|sandwich|sanduche|bagel|panqueque)/.test(n)) {
      return 'bakery';
    }
    // Bebidas / Café / Licores / Refrescos
    if (/(cafe|espresso|capuchino|cappuccino|latte|moka|te|infusion|bebida|refresco|malta|jugo|chicha|agua|soda|cerveza|vino|licor|ron|vodka|whisky|coctel|smoothie|batido|merengada|energizante|monster|redbull|gatorade|coca|pepsi|chinotto|frescolita)/.test(n)) {
      return 'coffee';
    }
    // Carnes / Pollo / Pescado
    if (/(carne|molida|mechada|solomo|bistec|lomito|pollo|pechuga|muslo|ala|alas|milanesa|pescado|atun|salmon|sardina|camaron|marisco|cerdo|cochino|chuleta|jamon|salchicha|tocineta|mortadela|chorizo|costilla|nugget|albondiga)/.test(n)) {
      return 'meat';
    }
    // Lácteos / Huevos / Quesos
    if (/(queso|leche|suero|mantequilla|margarina|yogurt|yogur|crema|nata|cuajada|huevo|huevos|parmesano|gouda|mozzarella|mozarella|ricotta|cheddar)/.test(n)) {
      return 'dairy';
    }
    // Frutas / Verduras / Ensaladas
    if (/(tomate|cebolla|papa|papas|platano|cambur|banana|fruta|verdura|hortaliza|aguacate|lechuga|zanahoria|limon|naranja|manzana|fresa|pina|ajo|cilantro|perejil|pimenton|melon|patilla|sandia|pepino|calabacin|repollo|yuca|ocumo|auyama|guayaba|mango|ensalada)/.test(n)) {
      return 'produce';
    }
    // Granos / Harinas / Cereales / Pastas
    if (/(arroz|harina|pan harina|pasta|espagueti|fideos|avena|cereal|cornflakes|caraota|caraotas|frijol|lenteja|garbanzo|trigo|maiz|maizina|fororo|granos)/.test(n)) {
      return 'grain';
    }
    // Enlatados / Salsas / Condimentos / Despensa
    if (/(salsa|mayonesa|ketchup|mostaza|enlatado|lata|guisantes|vinagre|aceite|aderezo|caldo|cubito|mermelada|miel|nutella|atun en lata)/.test(n)) {
      return 'canned';
    }
    // Snacks / Golosinas / Chocolates / Helados
    if (/(snack|chocolate|caramelo|papitas|doritos|cheetos|lays|platanitos|frutos secos|mani|cotufas|gomitas|chicle|bombon|pirulin|galak|toronto|cocosette|susy|barquilla|helado)/.test(n)) {
      return 'snack';
    }
    // Limpieza / Hogar / Detergentes
    if (/(cloro|detergente|jabon en polvo|desinfectante|esponja|lavaplatos|suavizante|escoba|coleto|toallin|papel higienico|papel sanitario|ajax|ariel|ace|limpiador|ambientador)/.test(n)) {
      return 'cleaning';
    }
    // Higiene Personal / Aseo
    if (/(champu|shampoo|acondicionador|jabon|jaboncillo|pasta dental|crema dental|cepillo|desodorante|toalla|toallas sanitarias|afeitadora|gillette|talco|crema de cuerpo|protector solar|enjuague bucal)/.test(n)) {
      return 'hygiene';
    }
    // Farmacia / Medicinas / Cuidado
    if (/(pastilla|jarabe|antibiotico|ibuprofeno|acetaminofen|paracetamol|aspirina|medicina|alcohol|algodon|gasa|curita|ampolla|gotas|vitamina|capsula|analgesico|antihistaminico|pedialyte|suero)/.test(n)) {
      return 'pharmacy';
    }

    return 'general';
  }

  /**
   * Deduce el icono temático de tienda más apropiado según su nombre o tipo de documento
   * @param {string} storeName 
   * @param {string} docType 
   * @returns {string} ID del icono en AppIcons.stores
   */
  guessStoreIcon(storeName, docType = 'FACTURA') {
    if (!storeName || typeof storeName !== 'string') {
      return docType === 'MENU_LISTA' ? 'restaurant' : 'supermarket';
    }
    const s = storeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/(farmacia|farma|botica|drogueria|boticario|saas|farmatodo|locatel)/.test(s)) {
      return 'pharmacy';
    }
    if (/(panaderia|pasteleria|dulceria|croissant|panificadora|bakery)/.test(s)) {
      return 'bakery';
    }
    if (/(carniceria|frigorifico|charcuteria|carnes|pescaderia)/.test(s)) {
      return 'butcher';
    }
    if (/(fruteria|verduleria|hortalizas|mercado libre|huerto)/.test(s)) {
      return 'produce';
    }
    if (/(restaurant|restaurante|cafe|cafeteria|bistro|pizzeria|burger|hamburguesas|sushi|comida|fast food|diner|bar|tasca|churrasqueria|pollo|arepera)/.test(s) || docType === 'MENU_LISTA') {
      return 'restaurant';
    }
    if (/(bodegon|licoreria|licores|importados|delicateses)/.test(s)) {
      return 'bodegon';
    }
    if (/(mall|centro comercial|tienda|departamentos|traki|daka|multimax)/.test(s)) {
      return 'mall';
    }
    if (/(abasto|bodega|minimarket|quiosco|kiosko)/.test(s)) {
      return 'shop';
    }

    return 'supermarket';
  }

  /**
   * Analiza una imagen (factura, menú de restaurante, catálogo, lista de compras o tabla de precios) usando Gemini Flash
   * @param {string} base64DataUrl - Imagen en formato dataURL
   * @param {string} mode - 'FACTURA', 'MENU_LISTA' o 'TABLA_PRECIOS'
   */
  async analyzeImage(base64DataUrl, mode = 'FACTURA') {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      throw new Error(
        'Falta la clave API de Google Gemini (Gratuita). Por favor ingrésala en Configuración o en la barra superior.'
      );
    }

    // Extraer mimeType y base64 puro
    const matches = base64DataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Formato de imagen base64 inválido');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    let contextDesc = 'facturas de compra, tickets de caja o recibos comerciales';
    if (mode === 'MENU_LISTA') {
      contextDesc = 'menús de restaurantes, cafeterías, panaderías, cartas de platos/bebidas, listas de compras o catálogos de productos';
    } else if (mode === 'TABLA_PRECIOS') {
      contextDesc = 'pizarras de precios, carteleras de abastos, etiquetas de estanterías o tablas de productos';
    }

    const promptText = `
Eres un extractor de datos de alta precisión para ${contextDesc} de Venezuela y Latinoamérica.
Analiza cuidadosamente esta imagen. La imagen PUEDE CONTENER MULTIPLES PRODUCTOS (como un menú completo con varios platos y bebidas, una lista de compras, una cartelera de precios con varios renglones, o una factura con muchos artículos).

OBJETIVO PRINCIPAL:
Extrae TODOS Y CADA UNO de los productos, artículos o platos identificables con su precio correspondiente. NO resumas, NO omitas productos; si detectas 3, 10, 25 o más productos, debes extraerlos todos individualmente en el array "items".

Devuelve EXCLUSIVAMENTE los siguientes campos en formato JSON estricto:
{
  "store_name": "Nombre de la tienda, restaurante, panadería o comercio (Ej: Central Madeirense, Burger Place, Farmatodo, Bodegón Express). Si no se distingue con claridad, deduce del encabezado o logo, o usa 'Comercio Detectado'",
  "date": "Fecha en formato YYYY-MM-DD (si no está visible, usa la fecha actual)",
  "currency": "USD o VES (Indica 'USD' si los precios están en dólares, $, ref, divisas; o 'VES' si están en Bs., bolívares)",
  "document_type": "${mode}",
  "total": 0.00,
  "items": [
    {
      "name": "Nombre limpio del producto o plato SIN peso ni volumen (Ej: 'Hamburguesa Especial', 'Pizza Mediana', 'Harina PAN', 'Refresco Coca Cola', 'Café con Leche', 'Maiz para Cotufas Mary')",
      "weight": "Peso del producto si se indica en el empaque o texto (Ej: '400g', '1kg', '500 gr', '2 lb', '1/2 kg'). Si no tiene peso, usa null",
      "volume": "Volumen si se indica en el empaque o texto (Ej: '1.5L', '355ml', '2 Litros', '1 gal'). Si no tiene volumen, usa null",
      "quantity": "Cantidad en combo, pack o multipack si se indica (Ej: '2x', 'Pack de 6', 'Combo 3x', '12 unid'). Si es compra o plato individual normal, usa 1.0 o null",
      "price": 0.00,
      "total": 0.00,
      "category_hint": "restaurant | bakery | coffee | meat | dairy | produce | grain | canned | snack | cleaning | hygiene | pharmacy | general"
    }
  ]
}

REGLAS CRÍTICAS:
1. "name" - LIMPIEZA ABSOLUTA DE PESO Y VOLUMEN:
   El campo "name" NUNCA debe contener el peso (g, gr, kg, lb) ni el volumen (ml, cc, L, litros).
   - INCORRECTO: "Maiz para Cotufas Mary 400g" -> CORRECTO: name: "Maiz para Cotufas Mary", weight: "400g".
   - INCORRECTO: "Refresco Pepsi 1.5L" -> CORRECTO: name: "Refresco Pepsi", volume: "1.5L".
   - INCORRECTO: "Harina PAN 1 Kg" -> CORRECTO: name: "Harina PAN", weight: "1kg".
   - INCORRECTO: "Pack 6 Cerveza 355ml" -> CORRECTO: name: "Cerveza", quantity: "Pack de 6", volume: "355ml".
   - INCORRECTO: "Combo 2x Hamburguesas" -> CORRECTO: name: "Hamburguesas", quantity: "Combo 2x".
2. "weight": Texto del peso identificado (ej: '400g', '1kg', '250 g', '2 lb'). Si no aplica o no se menciona, usa null.
3. "volume": Texto del volumen identificado (ej: '1.5L', '355ml', '2 L'). Si no aplica o no se menciona, usa null.
4. "quantity": Si es un combo, oferta multipack o paquete, indica el texto correspondiente (ej: '2x', 'Pack de 6', 'Combo 2x'). En compras estándar de facturas donde se facturaron N unidades individuales, puedes colocar la cantidad numérica.
5. "items": Registra cada producto o plato individual que posea un precio legible. Limpia el nombre de códigos irrelevantes o símbolos extraños (#, %, barras).
6. "category_hint": Elige de la lista la categoría/icono que mejor corresponda al producto o plato:
   - "restaurant": Comida rápida, platos preparados, pizzas, hamburguesas, sushi, combos, arepas, empanadas, etc.
   - "bakery": Panes, dulces, galletas, ponqués, tortas, bollería.
   - "coffee": Café, té, refrescos, maltas, cervezas, licores, jugos, bebidas.
   - "meat": Carnes rojas, pollo, pescado, mariscos, embutidos.
   - "dairy": Quesos, leche, huevos, mantequilla, yogurt.
   - "produce": Frutas, verduras, hortalizas, legumbres frescas.
   - "grain": Harina, arroz, pastas, cereales, granos secos.
   - "canned": Enlatados, salsas, aceites, condimentos.
   - "snack": Chocolates, papitas, golosinas, helados.
   - "cleaning": Detergentes, cloro, desinfectantes, artículos del hogar.
   - "hygiene": Champú, jabón, pasta dental, desodorante, aseo personal.
   - "pharmacy": Medicinas, pastillas, jarabes, salud.
   - "general": Otros artículos.
7. "price": Precio unitario en formato número flotante/decimal sin símbolos ni letras (Ejemplo: 4.50, 15.00, 180.25).
8. "total": En facturas es el total general del documento. En menús o listas donde no hay un total global de compra, calcula la suma de los ítems o 0.00.
9. "currency": Si la mayoría de precios usan $, ref o dólares -> "USD". Si usan Bs, bolívares -> "VES".
10. REGLA ESTRICTA DE SEGURIDAD: NO intentes calificar el producto, NO agregues estrellas, NO inventes valoraciones de calidad. Las calificaciones son exclusivas del usuario.
11. Devuelve SOLO el objeto JSON puro sin bloques markdown (\`\`\`json) ni explicaciones adicionales.
`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    };

    const candidateModels = await this.getCandidateModels(apiKey);
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          let msg = `Error de API Gemini (${response.status})`;
          try {
            const errObj = JSON.parse(errText);
            if (errObj.error && errObj.error.message) {
              msg = errObj.error.message;
            }
          } catch (e) {}

          // Si el modelo específico ya no está disponible, da 404, o tiene alta demanda temporal (503 / 429),
          // intentar automáticamente con el siguiente modelo de la lista para evitar fallos al usuario
          const isRetryable = response.status === 404 || response.status === 503 || response.status === 429 ||
            msg.includes('no longer available') || msg.includes('not found') || msg.includes('not supported') ||
            msg.includes('high demand') || msg.includes('overloaded');

          if (isRetryable) {
            console.warn(`Modelo ${modelName} con alta demanda o no disponible (${msg}), probando siguiente modelo de respaldo...`);
            lastError = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts?.[0]?.text) {
          throw new Error('La IA no devolvió contenido interpretable de la imagen.');
        }

        const rawJson = candidate.content.parts[0].text;
        let parsedResult;
        try {
          parsedResult = JSON.parse(rawJson);
        } catch (e) {
          const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
          parsedResult = JSON.parse(cleaned);
        }

        if (!parsedResult.items || !Array.isArray(parsedResult.items)) {
          parsedResult.items = [];
        }

        // Sanitizar y separar atributos (nombre limpio, peso, volumen, cantidad/combo) en cada producto
        parsedResult.items = parsedResult.items.map(item => {
          const sanitized = window.ProductUtils.sanitizeProductAttributes(item.name, item.weight, item.volume, item.quantity);
          return {
            ...item,
            name: sanitized.name,
            weight: sanitized.weight,
            volume: sanitized.volume,
            quantity: sanitized.quantity
          };
        });

        // Si tuvo éxito, recordar este modelo como el preferido
        this.defaultModel = modelName;
        return parsedResult;
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        const isRetryable = msg.includes('no longer available') || msg.includes('not found') || msg.includes('not supported') ||
          msg.includes('404') || msg.includes('high demand') || msg.includes('503') || msg.includes('429') || msg.includes('overloaded');
        if (isRetryable) {
          continue;
        }
        throw err;
      }
    }

    const activeTierName = this.modelTier === 'pro' ? 'Gemini Pro' : 'Gemini Flash';
    throw lastError || new Error(`No se pudo analizar la imagen con los modelos disponibles de ${activeTierName}.`);
  }

  /**
   * Guarda automáticamente los datos extraídos (múltiples productos) en la base de datos local
   * cumpliendo todas las reglas de negocio, asignación de iconos y registro contable opcional
   * @param {Object} extraction - Datos analizados por la IA
   * @param {Object|null} options - Opciones personalizadas (tienda, ítems seleccionados, moneda, gasto)
   */
  async processAndCommitExtraction(extraction, options = {}) {
    let compressedPhotoData = null;
    let selectedStoreId = null;
    let customStoreName = null;
    let selectedItems = null;
    let selectedCurrency = null;
    let shouldRecordExpense = null;

    if (options && options.dataUrl) {
      // Retrocompatibilidad si se envió directamente el objeto de foto comprimida
      compressedPhotoData = options;
    } else if (typeof options === 'object' && options !== null) {
      compressedPhotoData = options.compressedPhoto || null;
      selectedStoreId = options.storeId || null;
      customStoreName = options.storeName || null;
      selectedItems = options.items || null;
      selectedCurrency = options.currency || null;
      shouldRecordExpense = options.recordExpense !== undefined ? options.recordExpense : null;
    }

    const activeWs = window.authGroups ? window.authGroups.getActiveWorkspaceId() : 'personal';
    const currentBcvRate = window.bcvService ? window.bcvService.rate : 1.0;
    const date = extraction.date || new Date().toISOString().split('T')[0];
    const docType = extraction.document_type || 'FACTURA';
    const currency = (selectedCurrency || extraction.currency || 'USD').toUpperCase() === 'VES' ? 'VES' : 'USD';

    // 1. Resolver Tienda de Destino
    let store = null;
    let isNewStore = false;

    if (selectedStoreId && selectedStoreId !== 'NEW_DETECTED' && selectedStoreId !== 'CUSTOM_NEW') {
      store = await window.db.getById('stores', selectedStoreId);
    }

    if (!store) {
      const storeName = (customStoreName || extraction.store_name || 'Comercio Detectado').trim();
      store = await window.db.findStoreByName(storeName);
      if (!store) {
        isNewStore = true;
        const guessedStoreIcon = this.guessStoreIcon(storeName, docType);
        const newStoreId = await window.db.saveStore({
          workspace_id: activeWs,
          name: storeName,
          maps_url: `https://maps.google.com/?q=${encodeURIComponent(storeName)}`,
          lat: null,
          lng: null,
          image_type: 'icon',
          image_data: guessedStoreIcon,
          description: `Registrada automáticamente mediante escaneo inteligente (${docType.toLowerCase()}).`
        });
        store = await window.db.getById('stores', newStoreId);
      }
    }

    // 2. Procesar Productos Seleccionados
    const itemsToProcess = selectedItems || extraction.items || [];
    let newProductsCount = 0;
    let updatedProductsCount = 0;
    const processedItems = [];

    for (const item of itemsToProcess) {
      if (!item.name || item.price === undefined || isNaN(parseFloat(item.price))) continue;

      const sanitized = window.ProductUtils.sanitizeProductAttributes(item.name, item.weight, item.volume, item.quantity);
      const cleanName = sanitized.name;
      const weight = sanitized.weight || null;
      const volume = sanitized.volume || null;
      const quantity = sanitized.quantity || null;
      const unitPrice = parseFloat(item.price);
      const invoiceQty = parseFloat(item.invoiceQty || item.quantity) || 1;
      const totalItem = parseFloat(item.total) || (unitPrice * invoiceQty);

      // Regla: Si el documento/menú escaneado estaba en bolívares (VES),
      // convertir el precio unitario a dólares usando la tasa BCV del día.
      // El precio en Bs NO se guarda; se almacena 100% en USD.
      const unitPriceUsd = currency === 'VES'
        ? (currentBcvRate > 0 ? parseFloat((unitPrice / currentBcvRate).toFixed(4)) : unitPrice)
        : unitPrice;

      // Buscar si ya existe en esta tienda
      const existingProduct = await window.db.findProductByStoreAndName(store.id, cleanName);

      if (existingProduct) {
        // Actualizar precio actual en USD, preservar valoración personal de 1 a 5 estrellas intacta
        existingProduct.current_price = unitPriceUsd;
        existingProduct.original_currency = 'USD';
        existingProduct.updated_at = new Date().toISOString();
        if (weight) existingProduct.weight = weight;
        if (volume) existingProduct.volume = volume;
        if (quantity) existingProduct.quantity = quantity;

        await window.db.saveProduct(existingProduct, docType, currentBcvRate);
        updatedProductsCount++;
        processedItems.push({
          ...item,
          name: cleanName,
          weight,
          volume,
          quantity,
          productId: existingProduct.id,
          status: 'actualizado',
          rating: existingProduct.rating
        });
      } else {
        // Asignar icono temático estándar automático de AppIcons más correspondiente
        const guessedIcon = this.guessProductIcon(cleanName, item.category_hint);

        const newProduct = {
          workspace_id: activeWs,
          store_id: store.id,
          name: cleanName,
          weight: weight,
          volume: volume,
          quantity: quantity,
          current_price: unitPriceUsd,
          original_currency: 'USD',
          image_type: 'icon',
          image_data: guessedIcon,
          rating: null, // Dejado en blanco para valoración manual del usuario
          description: `Registrado automáticamente desde ${docType.toLowerCase()}${currency === 'VES' ? ` (Convertido de Bs. ${unitPrice.toFixed(2)} a tasa BCV)` : ''}.`
        };

        const savedProd = await window.db.saveProduct(newProduct, docType, currentBcvRate);
        newProductsCount++;
        processedItems.push({
          ...item,
          name: cleanName,
          weight,
          volume,
          quantity,
          productId: savedProd.id,
          status: 'nuevo',
          rating: savedProd.rating || null
        });
      }
    }

    // 3. Registrar Gasto y Factura si corresponde
    let invoiceRecord = null;
    let expenseRecord = null;

    // Si no se especificó explícitamente, por defecto sólo se registra gasto si es FACTURA
    const recordExpenseFinal = shouldRecordExpense !== null ? Boolean(shouldRecordExpense) : (docType === 'FACTURA');

    if (recordExpenseFinal && processedItems.length > 0) {
      let totalAmount = processedItems.reduce((acc, curr) => {
        const p = parseFloat(curr.price) || 0;
        const q = parseFloat(curr.quantity) || 1;
        return acc + (parseFloat(curr.total) || (p * q));
      }, 0);

      if (totalAmount <= 0 && extraction.total > 0) {
        totalAmount = parseFloat(extraction.total);
      }

      const totalUsd = currency === 'USD' ? totalAmount : window.bcvService.vesToUsd(totalAmount, currentBcvRate);
      const totalVes = currency === 'VES' ? totalAmount : window.bcvService.usdToVes(totalAmount, currentBcvRate);

      // Guardar Factura con foto ultra-comprimida WebP
      invoiceRecord = await window.db.saveInvoice({
        workspace_id: activeWs,
        store_id: store.id,
        store_name: store.name,
        date: date,
        total_usd: totalUsd,
        total_ves: totalVes,
        bcv_rate: currentBcvRate,
        items_count: processedItems.length,
        items_json: processedItems,
        photo_compressed_base64: compressedPhotoData ? compressedPhotoData.dataUrl : null,
        photo_size_bytes: compressedPhotoData ? compressedPhotoData.compressedSizeBytes : 0,
        original_size_bytes: compressedPhotoData ? compressedPhotoData.originalSizeBytes : 0
      });

      // Deducir categoría contable más adecuada
      let expenseCategory = 'Alimentos / Mercado';
      const storeLower = (store.name || '').toLowerCase();
      if (/(farmacia|farma|botica|drogueria|salud|medic|farmatodo|locatel)/.test(storeLower)) {
        expenseCategory = 'Salud / Farmacia';
      } else if (/(restaurant|cafe|cafeteria|pizzeria|burger|bar|tasca|comida rapida|heladeria|arepera)/.test(storeLower) || docType === 'MENU_LISTA') {
        expenseCategory = 'Ocio / Salidas';
      } else if (/(ferreteria|hogar|muebles|bazar|limpieza)/.test(storeLower)) {
        expenseCategory = 'Hogar';
      } else if (/(transporte|gasolina|taller|repuestos|taxi|metro)/.test(storeLower)) {
        expenseCategory = 'Transporte';
      }

      // Crear Gasto Contable Automático
      const expenseId = await window.db.saveExpense({
        workspace_id: activeWs,
        invoice_id: invoiceRecord.id,
        date: date,
        concept: `Compra en ${store.name}`,
        category: expenseCategory,
        amount_usd: totalUsd,
        amount_ves: totalVes,
        original_currency: currency,
        bcv_rate: currentBcvRate,
        source: docType,
        note: `${docType === 'FACTURA' ? 'Factura' : 'Registro múltiple'} con ${processedItems.length} productos procesados con IA.`
      });

      expenseRecord = await window.db.getById('expenses', expenseId);
    }

    return {
      store,
      isNewStore,
      newProductsCount,
      updatedProductsCount,
      totalItemsProcessed: processedItems.length,
      items: processedItems,
      invoice: invoiceRecord,
      expense: expenseRecord
    };
  }
}

window.aiScanner = new AIScannerService();
