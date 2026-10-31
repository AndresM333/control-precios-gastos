// Servicio de Escaneo Inteligente con IA (Google Gemini Flash)
class AIScannerService {
  constructor() {
    this.defaultModel = 'gemini-2.0-flash';
  }

  async getApiKey() {
    return await window.db.getSetting('gemini_api_key', '');
  }

  async setApiKey(key) {
    return await window.db.setSetting('gemini_api_key', key.trim());
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
      "name": "Nombre descriptivo y limpio del producto o plato (Ej: Hamburguesa Especial, Pizza Mediana, Harina PAN 1kg, Refresco 1.5L, Café con Leche)",
      "price": 0.00,
      "quantity": 1.0,
      "total": 0.00,
      "category_hint": "restaurant | bakery | coffee | meat | dairy | produce | grain | canned | snack | cleaning | hygiene | pharmacy | general"
    }
  ]
}

REGLAS CRÍTICAS:
1. "items": Registra cada producto o plato individual que posea un precio legible. Limpia el nombre de códigos irrelevantes o símbolos extraños.
2. "category_hint": Elige de la lista la categoría/icono que mejor corresponda al producto o plato:
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
3. "price": Precio unitario en formato número flotante/decimal sin símbolos ni letras (Ejemplo: 4.50, 15.00, 180.25).
4. "quantity": En menús, listas de precios o carteleras coloca 1.0 por defecto. En facturas donde se compró más de 1 unidad, coloca la cantidad indicada.
5. "total": En facturas es el total general del documento. En menús o listas donde no hay un total global de compra, calcula la suma de los ítems o 0.00.
6. "currency": Si la mayoría de precios usan $, ref o dólares -> "USD". Si usan Bs, bolívares -> "VES".
7. REGLA ESTRICTA DE SEGURIDAD: NO intentes calificar el producto, NO agregues estrellas, NO inventes valoraciones de calidad. Las calificaciones son exclusivas del usuario.
8. Devuelve SOLO el objeto JSON puro sin bloques markdown (\`\`\`json) ni explicaciones adicionales.
`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${apiKey}`;

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

    return parsedResult;
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

      const cleanName = item.name.trim();
      const unitPrice = parseFloat(item.price);
      const quantity = parseFloat(item.quantity) || 1;
      const totalItem = parseFloat(item.total) || (unitPrice * quantity);

      // Buscar si ya existe en esta tienda
      const existingProduct = await window.db.findProductByStoreAndName(store.id, cleanName);

      if (existingProduct) {
        // Actualizar precio actual, preservar valoración personal de 1 a 5 estrellas intacta
        existingProduct.current_price = unitPrice;
        existingProduct.original_currency = currency;
        existingProduct.updated_at = new Date().toISOString();

        await window.db.saveProduct(existingProduct, docType, currentBcvRate);
        updatedProductsCount++;
        processedItems.push({
          ...item,
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
          current_price: unitPrice,
          original_currency: currency,
          image_type: 'icon',
          image_data: guessedIcon,
          rating: null, // Dejado en blanco para valoración manual del usuario
          description: `Registrado automáticamente desde ${docType.toLowerCase()}.`
        };

        const savedProd = await window.db.saveProduct(newProduct, docType, currentBcvRate);
        newProductsCount++;
        processedItems.push({
          ...item,
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
