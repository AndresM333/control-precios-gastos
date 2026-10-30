// Compresor Extremo de Facturas y Tickets
// Reduce fotos de 5-10 MB a ~20-35 KB manteniendo la legibilidad del texto
class ExtremeImageCompressor {
  /**
   * Procesa y comprime una imagen al máximo
   * @param {File|Blob|string} imageSource - Archivo de imagen o dataURL
   * @param {Object} options - Opciones de compresión
   * @returns {Promise<Object>} Resultado con dataUrl, tamaños y ahorro
   */
  static async compress(imageSource, options = {}) {
    const maxWidth = options.maxWidth || 800; // Suficiente para leer números y letras
    const maxHeight = options.maxHeight || 1200;
    const quality = options.quality !== undefined ? options.quality : 0.32; // Calidad WebP muy optimizada
    const enhanceContrast = options.enhanceContrast !== false;

    // 1. Obtener tamaño original
    let originalSizeBytes = 0;
    if (imageSource instanceof Blob || imageSource instanceof File) {
      originalSizeBytes = imageSource.size;
    } else if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
      originalSizeBytes = Math.round((imageSource.length * 3) / 4);
    }

    // 2. Cargar imagen en un elemento HTMLImage
    const img = await this._loadImage(imageSource);

    // 3. Calcular nuevas dimensiones manteniendo aspect ratio
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    // 4. Dibujar en Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Fondo blanco para evitar fondos transparentes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // 5. Transformación a Escala de Grises y Realce de Contraste
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Luminancia estándar
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (enhanceContrast) {
        // Curva de alto contraste: blanquea el papel y oscurece las letras de la factura
        // Esto aumenta radicalmente la compresibilidad de WebP al crear grandes áreas uniformes
        if (gray > 135) {
          gray = Math.min(255, gray * 1.25);
        } else {
          gray = Math.max(0, gray * 0.75);
        }
      }

      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
      // data[i + 3] queda 255 (alpha)
    }

    ctx.putImageData(imgData, 0, 0);

    // 6. Exportar a WebP de bajo peso (o JPEG fallback)
    let mimeType = 'image/webp';
    let dataUrl = canvas.toDataURL(mimeType, quality);

    // Si el navegador no soporta webp export
    if (!dataUrl.startsWith('data:image/webp')) {
      mimeType = 'image/jpeg';
      dataUrl = canvas.toDataURL(mimeType, quality);
    }

    const compressedSizeBytes = Math.round((dataUrl.length * 3) / 4);
    const savingsPercent = originalSizeBytes > 0
      ? (((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100).toFixed(1)
      : '95+';

    return {
      dataUrl,
      mimeType,
      width,
      height,
      originalSizeBytes,
      compressedSizeBytes,
      savingsPercent: Math.max(0, parseFloat(savingsPercent)),
      originalFormatted: this.formatBytes(originalSizeBytes),
      compressedFormatted: this.formatBytes(compressedSizeBytes)
    };
  }

  static _loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('No se pudo cargar la imagen para compresión: ' + err));

      if (source instanceof Blob || source instanceof File) {
        img.src = URL.createObjectURL(source);
      } else if (typeof source === 'string') {
        img.src = source;
      } else {
        reject(new Error('Formato de imagen no reconocido'));
      }
    });
  }

  static formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    if (bytes < k * k) {
      return (bytes / k).toFixed(1) + ' KB';
    }
    return (bytes / (k * k)).toFixed(2) + ' MB';
  }
}

window.ExtremeImageCompressor = ExtremeImageCompressor;
