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
   * Analiza una imagen de factura o tabla de precios usando Gemini Flash
   * @param {string} base64DataUrl - Imagen en formato dataURL
   * @param {string} mode - 'FACTURA' o 'TABLA_PRECIOS'
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

    const promptText = `
Eres un extractor de datos de alta precisión para facturas, tickets de compra y listas de precios de Venezuela.
Analiza cuidadosamente esta imagen.

Extrae EXCLUSIVAMENTE los siguientes campos en formato JSON estricto:
{
  "store_name": "Nombre de la tienda, comercio o supermercado (Ej: Central Madeirense, Farmatodo, Bodegón X). Si no se distingue con claridad, usa 'Tienda Desconocida'",
  "date": "Fecha de la compra en formato YYYY-MM-DD (si no está visible, usa la fecha actual)",
  "currency": "USD o VES (Moneda principal en la que están expresados los precios individuales)",
  "document_type": "${mode}",
  "total": 0.00,
  "items": [
    {
      "name": "Nombre descriptivo y limpio del producto (Ej: Harina PAN 1kg, Arroz Mary 1kg)",
      "price": 0.00,
      "quantity": 1.0,
      "total": 0.00
    }
  ]
}

REGLAS CRÍTICAS:
1. "price" debe ser el precio unitario del producto como número flotante (sin símbolos de $ ni Bs).
2. Si los precios están en Bolívares, pon "currency": "VES". Si están en Dólares, pon "currency": "USD".
3. NO incluyas productos sin nombre o sin precio legible.
4. REGLA ESTRICTA DE SEGURIDAD: NO intentes calificar el producto, NO agregues estrellas, NO inventes valoraciones de calidad. Las valoraciones de calidad son manuales del usuario.
5. Devuelve SOLO el objeto JSON puro sin bloques markdown ni explicaciones adicionales.
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
      // Intenta limpiar bloques markdown si los trajo
      const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(cleaned);
    }

    return parsedResult;
  }

  /**
   * Guarda automáticamente los datos extraídos en la base de datos local
   * cumpliendo todas las reglas de negocio
   */
  async processAndCommitExtraction(extraction, compressedPhotoData = null) {
    const currentBcvRate = window.bcvService.rate;
    const storeName = (extraction.store_name || 'Tienda Desconocida').trim();
    const date = extraction.date || new Date().toISOString().split('T')[0];
    const currency = (extraction.currency || 'USD').toUpperCase() === 'VES' ? 'VES' : 'USD';
    const items = extraction.items || [];
    const docType = extraction.document_type || 'FACTURA';

    // 1. Verificar o Crear Tienda
    let store = await window.db.findStoreByName(storeName);
    let isNewStore = false;

    if (!store) {
      isNewStore = true;
      const newStoreId = await window.db.saveStore({
        name: storeName,
        maps_url: `https://maps.google.com/?q=${encodeURIComponent(storeName)}`,
        lat: null,
        lng: null,
        description: 'Registrada automáticamente mediante escaneo de factura.'
      });
      store = await window.db.getById('stores', newStoreId);
    }

    // 2. Procesar Productos
    let newProductsCount = 0;
    let updatedProductsCount = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.name || item.price === undefined || isNaN(parseFloat(item.price))) continue;

      const cleanName = item.name.trim();
      const unitPrice = parseFloat(item.price);
      const quantity = parseFloat(item.quantity) || 1;
      const totalItem = parseFloat(item.total) || (unitPrice * quantity);

      // Buscar si ya existe en esta tienda
      const existingProduct = await window.db.findProductByStoreAndName(store.id, cleanName);

      if (existingProduct) {
        // Actualizar precio actual, preservar valoración de 1 a 5 estrellas intacta
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
        // Crear nuevo producto (con rating null - regla estricta: IA no toca valoración)
        const newProduct = {
          store_id: store.id,
          name: cleanName,
          current_price: unitPrice,
          original_currency: currency,
          rating: null, // Dejado en blanco para valoración manual personal del usuario
          description: `Registrado automáticamente desde ${docType.toLowerCase()}.`
        };

        const savedProd = await window.db.saveProduct(newProduct, docType, currentBcvRate);
        newProductsCount++;
        processedItems.push({
          ...item,
          productId: savedProd.id,
          status: 'nuevo',
          rating: null
        });
      }
    }

    // 3. Si es Factura: Guardar Factura con Foto Comprimida y Registrar Gasto Contable
    let invoiceRecord = null;
    let expenseRecord = null;

    if (docType === 'FACTURA' && (extraction.total > 0 || processedItems.length > 0)) {
      let totalAmount = parseFloat(extraction.total);
      if (isNaN(totalAmount) || totalAmount <= 0) {
        totalAmount = processedItems.reduce((acc, curr) => acc + (parseFloat(curr.total) || (parseFloat(curr.price) * (parseFloat(curr.quantity) || 1))), 0);
      }

      const totalUsd = currency === 'USD' ? totalAmount : window.bcvService.vesToUsd(totalAmount, currentBcvRate);
      const totalVes = currency === 'VES' ? totalAmount : window.bcvService.usdToVes(totalAmount, currentBcvRate);

      // Guardar Factura con foto ultra-comprimida WebP
      invoiceRecord = await window.db.saveInvoice({
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

      // Crear Gasto Contable Automático
      const expenseId = await window.db.saveExpense({
        invoice_id: invoiceRecord.id,
        date: date,
        concept: `Compra en ${store.name}`,
        category: 'Alimentos / Mercado',
        amount_usd: totalUsd,
        amount_ves: totalVes,
        original_currency: currency,
        bcv_rate: currentBcvRate,
        source: 'FACTURA',
        note: `Factura con ${processedItems.length} productos procesada con IA.`
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
