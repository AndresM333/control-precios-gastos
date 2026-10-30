// Motor de Gráficas de Historial de Precios por Producto (100% Nativo y Offline)
class ProductPriceChart {
  constructor(containerElement) {
    this.container = containerElement;
    this.product = null;
    this.history = [];
    this.currentRange = 'ALL'; // '1M', '3M', '6M', '1Y', 'ALL'
    this.displayCurrency = 'USD'; // 'USD' o 'VES'
    this.hoverPoint = null;
  }

  setData(product, history) {
    this.product = product;
    this.history = history || [];
    this.render();
  }

  setRange(range) {
    this.currentRange = range;
    this.render();
  }

  setCurrency(currency) {
    this.displayCurrency = currency;
    this.render();
  }

  getFilteredHistory() {
    if (!this.history || this.history.length === 0) return [];

    const now = new Date();
    let cutoff = null;

    if (this.currentRange === '1M') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (this.currentRange === '3M') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    } else if (this.currentRange === '6M') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    } else if (this.currentRange === '1Y') {
      cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    if (!cutoff) {
      return [...this.history];
    }

    const filtered = this.history.filter(h => new Date(h.date) >= cutoff);
    return filtered.length > 0 ? filtered : [...this.history];
  }

  render() {
    if (!this.container) return;

    const items = this.getFilteredHistory();
    const currentRate = window.bcvService.rate;

    // Normalizar puntos a la moneda seleccionada
    const points = items.map(item => {
      let val = parseFloat(item.price);
      const itemRate = item.bcv_rate || currentRate;

      if (this.displayCurrency === 'USD') {
        if (item.currency === 'VES') {
          val = itemRate > 0 ? val / itemRate : val;
        }
      } else {
        if (item.currency === 'USD') {
          val = val * itemRate;
        }
      }

      return {
        date: new Date(item.date),
        rawDate: item.date,
        price: val,
        originalPrice: item.price,
        originalCurrency: item.currency,
        source: item.source || 'REGISTRO',
        rate: itemRate
      };
    }).sort((a, b) => a.date - b.date);

    // Calcular cambio porcentual (Primer vs Último punto del rango)
    let percentChange = 0;
    let initialPrice = 0;
    let finalPrice = 0;

    if (points.length >= 2) {
      initialPrice = points[0].price;
      finalPrice = points[points.length - 1].price;
      if (initialPrice > 0) {
        percentChange = ((finalPrice - initialPrice) / initialPrice) * 100;
      }
    } else if (points.length === 1) {
      initialPrice = points[0].price;
      finalPrice = points[0].price;
    }

    const isPositive = percentChange > 0;
    const isNegative = percentChange < 0;
    const badgeColor = isPositive ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                     : isNegative ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                     : 'bg-slate-500/10 text-slate-400 border-slate-500/20';

    const changeText = isPositive ? `+${percentChange.toFixed(1)}% Subió` 
                     : isNegative ? `${percentChange.toFixed(1)}% Bajó (Ahorro)` 
                     : '0.0% Sin cambio';

    const symbol = this.displayCurrency === 'USD' ? '$' : 'Bs.';

    let html = `
      <div class="chart-wrapper bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
        <!-- Header con selector de moneda y rango -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
          <div>
            <span class="text-xs font-medium uppercase tracking-wider text-slate-400">Variación en el período</span>
            <div class="flex items-center gap-3 mt-1">
              <span class="text-2xl font-bold text-slate-100">${symbol} ${finalPrice.toFixed(2)}</span>
              <span class="px-2.5 py-1 text-xs font-semibold rounded-full border ${badgeColor}">
                ${changeText}
              </span>
            </div>
          </div>

          <!-- Currency Toggle -->
          <div class="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button type="button" class="px-3 py-1 rounded-lg text-xs font-medium transition ${this.displayCurrency === 'USD' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}" onclick="window.activePriceChart.setCurrency('USD')">
              USD ($)
            </button>
            <button type="button" class="px-3 py-1 rounded-lg text-xs font-medium transition ${this.displayCurrency === 'VES' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}" onclick="window.activePriceChart.setCurrency('VES')">
              Bolívares (Bs)
            </button>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          ${['1M', '3M', '6M', '1Y', 'ALL'].map(r => `
            <button type="button" 
                    onclick="window.activePriceChart.setRange('${r}')"
                    class="px-3 py-1 rounded-lg text-xs font-medium transition ${this.currentRange === r ? 'bg-slate-700 text-white border border-slate-600 font-bold' : 'text-slate-400 hover:bg-slate-800'}">
              ${r === 'ALL' ? 'Todo' : r}
            </button>
          `).join('')}
        </div>

        <!-- SVG Interactive Canvas -->
        <div class="relative w-full h-56 bg-slate-950/60 rounded-xl p-2 border border-slate-800/60 flex items-center justify-center">
          ${this._renderSvgChart(points, symbol)}
        </div>

        <!-- Historial detallado por fechas -->
        <div class="mt-5">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Registros de precios con fecha</h4>
          <div class="max-h-44 overflow-y-auto space-y-2 pr-1">
            ${points.slice().reverse().map((p, idx) => {
              const formattedDate = p.date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
              return `
                <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${idx === 0 ? 'bg-blue-400' : 'bg-slate-600'}"></span>
                    <span class="text-slate-300 font-medium">${formattedDate}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">${p.source}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-bold text-slate-100">${symbol} ${p.price.toFixed(2)}</span>
                    <span class="text-[10px] text-slate-500 block">Tasa: Bs. ${p.rate.toFixed(2)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  _renderSvgChart(points, symbol) {
    if (!points || points.length === 0) {
      return `<p class="text-xs text-slate-500">No hay registros de precios para este rango</p>`;
    }

    if (points.length === 1) {
      return `
        <div class="text-center p-4">
          <p class="text-sm font-semibold text-slate-300">Un solo precio registrado hasta ahora</p>
          <p class="text-xl font-bold text-blue-400 mt-1">${symbol} ${points[0].price.toFixed(2)}</p>
          <p class="text-xs text-slate-500 mt-1">Registra más compras o edita el precio para ver la curva de evolución.</p>
        </div>
      `;
    }

    const width = 600;
    const height = 200;
    const padX = 45;
    const padY = 30;

    const prices = points.map(p => p.price);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);

    // Dar margen para que la línea no toque los bordes exactos
    if (minPrice === maxPrice) {
      minPrice = minPrice * 0.9;
      maxPrice = maxPrice * 1.1;
    } else {
      const margin = (maxPrice - minPrice) * 0.15;
      minPrice = Math.max(0, minPrice - margin);
      maxPrice = maxPrice + margin;
    }

    const getX = (index) => padX + (index / (points.length - 1)) * (width - 2 * padX);
    const getY = (val) => height - padY - ((val - minPrice) / (maxPrice - minPrice)) * (height - 2 * padY);

    const pathCoords = points.map((p, i) => `${getX(i)},${getY(p.price)}`).join(' L ');
    const linePath = `M ${pathCoords}`;

    // Área sombreada bajo la curva
    const firstX = getX(0);
    const lastX = getX(points.length - 1);
    const bottomY = height - padY;
    const areaPath = `M ${firstX},${bottomY} L ${pathCoords} L ${lastX},${bottomY} Z`;

    const isTrendUp = points[points.length - 1].price > points[0].price;
    const strokeColor = isTrendUp ? '#ef4444' : '#10b981'; // Rojo si subió, Verde si bajó
    const fillId = isTrendUp ? 'chartGradRed' : 'chartGradGreen';

    return `
      <svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="chartGradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="chartGradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#ef4444" stop-opacity="0.0"/>
          </linearGradient>
        </defs>

        <!-- Horizontal Guide Lines -->
        <line x1="${padX}" y1="${getY(minPrice)}" x2="${width - padX}" y2="${getY(minPrice)}" stroke="#334155" stroke-width="1" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${getY((minPrice + maxPrice) / 2)}" x2="${width - padX}" y2="${getY((minPrice + maxPrice) / 2)}" stroke="#1e293b" stroke-width="1"/>
        <line x1="${padX}" y1="${getY(maxPrice)}" x2="${width - padX}" y2="${getY(maxPrice)}" stroke="#334155" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- Y Axis Labels -->
        <text x="${padX - 8}" y="${getY(maxPrice) + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${symbol}${maxPrice.toFixed(2)}</text>
        <text x="${padX - 8}" y="${getY(minPrice) + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${symbol}${minPrice.toFixed(2)}</text>

        <!-- Area Fill -->
        <path d="${areaPath}" fill="url(#${fillId})"/>

        <!-- Line Chart -->
        <path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Points Dots & Date Labels -->
        ${points.map((p, i) => {
          const x = getX(i);
          const y = getY(p.price);
          const shortDate = p.date.toLocaleDateString('es-VE', { day: 'numeric', month: 'numeric' });
          return `
            <g class="cursor-pointer group">
              <circle cx="${x}" cy="${y}" r="5" fill="${strokeColor}" stroke="#0f172a" stroke-width="2"/>
              <text x="${x}" y="${height - 8}" fill="#64748b" font-size="10" text-anchor="middle">${shortDate}</text>
              <title>${shortDate}: ${symbol}${p.price.toFixed(2)} (${p.source})</title>
            </g>
          `;
        }).join('')}
      </svg>
    `;
  }
}

window.ProductPriceChart = ProductPriceChart;
