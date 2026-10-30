// Tasa Oficial de Cambio (Banco Central de Venezuela / Banco de Venezuela)
class BCVService {
  constructor() {
    this.rate = 45.00; // Valor de respaldo inicial razonable
    this.lastUpdated = null;
    this.source = 'Valor por defecto';
    this.listeners = [];
  }

  async init() {
    // 1. Cargar tasa guardada en configuración local
    const savedRate = await window.db.getSetting('bcv_rate');
    const savedDate = await window.db.getSetting('bcv_last_updated');
    const savedSource = await window.db.getSetting('bcv_source');

    if (savedRate && !isNaN(parseFloat(savedRate))) {
      this.rate = parseFloat(savedRate);
      this.lastUpdated = savedDate;
      this.source = savedSource || 'Guardada en dispositivo';
    }

    // 2. Intentar actualizar desde la API en segundo plano
    this.fetchLiveRate().catch(() => {
      console.warn('No se pudo conectar a la API del BCV en línea, usando tasa local/caché.');
    });

    return this.rate;
  }

  async fetchLiveRate() {
    const apis = [
      {
        url: 'https://ve.dolarapi.com/v1/dolares/oficial',
        parse: (data) => data.promedio || data.precio
      },
      {
        url: 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv',
        parse: (data) => {
          if (data && data.monitors && data.monitors.usd) {
            return data.monitors.usd.price;
          }
          return null;
        }
      }
    ];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(api.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const rateVal = api.parse(data);
          if (rateVal && !isNaN(rateVal) && rateVal > 0) {
            this.rate = parseFloat(rateVal);
            this.lastUpdated = new Date().toISOString();
            this.source = 'API Oficial BCV / DolarApi';
            await this.saveToDB();
            this.notify();
            return this.rate;
          }
        }
      } catch (err) {
        // Intenta la siguiente API
        console.warn(`Fallo al consultar ${api.url}:`, err.message);
      }
    }

    throw new Error('No se pudo obtener la tasa desde ninguna API pública');
  }

  async setManualRate(newRate) {
    const val = parseFloat(newRate);
    if (isNaN(val) || val <= 0) {
      throw new Error('Tasa inválida. Debe ser un número positivo.');
    }
    this.rate = val;
    this.lastUpdated = new Date().toISOString();
    this.source = 'Ingresada manualmente';
    await this.saveToDB();
    this.notify();
    return this.rate;
  }

  async saveToDB() {
    await window.db.setSetting('bcv_rate', this.rate);
    await window.db.setSetting('bcv_last_updated', this.lastUpdated);
    await window.db.setSetting('bcv_source', this.source);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.rate, this.lastUpdated, this.source);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Currency Conversions
  usdToVes(amountUsd, customRate = null) {
    const r = customRate || this.rate;
    return (parseFloat(amountUsd) || 0) * r;
  }

  vesToUsd(amountVes, customRate = null) {
    const r = customRate || this.rate;
    if (r === 0) return 0;
    return (parseFloat(amountVes) || 0) / r;
  }

  calculatePair(amount, originalCurrency, customRate = null) {
    const val = parseFloat(amount) || 0;
    const r = customRate || this.rate;
    if (originalCurrency === 'USD') {
      return {
        usd: val,
        ves: val * r,
        rateUsed: r
      };
    } else {
      return {
        usd: r > 0 ? val / r : 0,
        ves: val,
        rateUsed: r
      };
    }
  }

  formatUSD(amount) {
    const val = parseFloat(amount) || 0;
    return '$ ' + val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatVES(amount) {
    const val = parseFloat(amount) || 0;
    return 'Bs. ' + val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

window.bcvService = new BCVService();
