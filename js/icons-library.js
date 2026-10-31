// Biblioteca de Iconos SVG Estándar para Productos y Tiendas
const AppIcons = {
  // --- ICONOS DE PRODUCTOS ---
  products: {
    'grain': {
      id: 'grain',
      name: 'Granos / Harinas / Cereales',
      category: 'Alimentos Básicos',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="6" y1="21" x2="18" y2="21"/><line x1="12" y1="16" x2="12" y2="21"/></svg>`
    },
    'dairy': {
      id: 'dairy',
      name: 'Lácteos / Huevos / Quesos',
      category: 'Refrigerados',
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8v4H8z"/><path d="M6 6h12l1 16H5L6 6z"/><line x1="10" y1="11" x2="14" y2="11"/></svg>`
    },
    'meat': {
      id: 'meat',
      name: 'Carnes / Pollo / Pescado',
      category: 'Proteínas',
      color: '#f87171',
      bg: 'rgba(248, 113, 113, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12.5" cy="8.5" r="5"/><path d="M16 12l3.5 3.5a2.12 2.12 0 0 1-3 3L13 15"/><path d="M8 16l-3.5 3.5a2.12 2.12 0 0 0 3 3L11 19"/></svg>`
    },
    'produce': {
      id: 'produce',
      name: 'Frutas / Verduras / Hortalizas',
      category: 'Frescos',
      color: '#4ade80',
      bg: 'rgba(74, 222, 128, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5c0 4-5 13-5 13S7 11 7 7a5 5 0 0 1 5-5z"/><circle cx="12" cy="7" r="1.5"/></svg>`
    },
    'canned': {
      id: 'canned',
      name: 'Enlatados / Salsas / Pastas',
      category: 'Despensa',
      color: '#fb923c',
      bg: 'rgba(251, 146, 60, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><ellipse cx="12" cy="12" rx="8" ry="3"/></svg>`
    },
    'coffee': {
      id: 'coffee',
      name: 'Café / Té / Bebidas',
      category: 'Bebidas',
      color: '#d97706',
      bg: 'rgba(217, 119, 6, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`
    },
    'bakery': {
      id: 'bakery',
      name: 'Pan / Galletas / Repostería',
      category: 'Panadería',
      color: '#facc15',
      bg: 'rgba(250, 204, 21, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10c0-3.87 3.13-7 7-7s7 3.13 7 7c0 .88-.16 1.73-.46 2.5H5.46C5.16 11.73 5 10.88 5 10z"/><rect x="4" y="12.5" width="16" height="7.5" rx="2"/><line x1="9" y1="15" x2="9" y2="18"/><line x1="15" y1="15" x2="15" y2="18"/></svg>`
    },
    'cleaning': {
      id: 'cleaning',
      name: 'Limpieza / Detergentes / Hogar',
      category: 'Hogar',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M18 10l2-2a2 2 0 0 0-2.83-2.83L14 8"/><path d="M14 8l4 4"/><circle cx="19" cy="19" r="2"/></svg>`
    },
    'pharmacy': {
      id: 'pharmacy',
      name: 'Farmacia / Medicinas / Cuidado',
      category: 'Salud',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M12 9v9"/><path d="M7.5 13.5h9"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`
    },
    'hygiene': {
      id: 'hygiene',
      name: 'Higiene Personal / Champú / Jabón',
      category: 'Aseo',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3"/><path d="M8 5h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4V5z"/><path d="M6 12h12v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8z"/></svg>`
    },
    'snack': {
      id: 'snack',
      name: 'Snacks / Golosinas / Chocolates',
      category: 'Golosinas',
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 15a4 4 0 0 0 8 0"/></svg>`
    },
    'general': {
      id: 'general',
      name: 'General / Otros Artículos',
      category: 'Varios',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`
    },
    'restaurant': {
      id: 'restaurant',
      name: 'Comida / Platos Preparados / Menú',
      category: 'Restaurante',
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M2 13h10a4 4 0 0 0 4-4V2H6a4 4 0 0 0-4 4v7z"/><line x1="2" y1="2" x2="2" y2="7"/><line x1="6" y1="2" x2="6" y2="7"/></svg>`
    }
  },

  // --- ICONOS DE TIENDAS ---
  stores: {
    'supermarket': {
      id: 'supermarket',
      name: 'Supermercado / Hipermercado',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`
    },
    'restaurant': {
      id: 'restaurant',
      name: 'Restaurante / Cafetería / Comida Rápida',
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M2 13h10a4 4 0 0 0 4-4V2H6a4 4 0 0 0-4 4v7z"/><line x1="2" y1="2" x2="2" y2="7"/><line x1="6" y1="2" x2="6" y2="7"/></svg>`
    },
    'shop': {
      id: 'shop',
      name: 'Bodega / Minimarket / Abasto',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
    },
    'pharmacy': {
      id: 'pharmacy',
      name: 'Farmacia / Botica',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`
    },
    'bakery': {
      id: 'bakery',
      name: 'Panadería / Pastelería',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13a6 6 0 0 0 12 0H2z"/><path d="M10 13a6 6 0 0 0 12 0h-12z"/><path d="M12 7a3 3 0 0 1 3 3"/><path d="M6 7a3 3 0 0 1 3 3"/></svg>`
    },
    'butcher': {
      id: 'butcher',
      name: 'Carnicería / Charcutería',
      color: '#f87171',
      bg: 'rgba(248, 113, 113, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg>`
    },
    'produce': {
      id: 'produce',
      name: 'Frutería / Verdulería',
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7z"/><circle cx="12" cy="10" r="3"/></svg>`
    },
    'mall': {
      id: 'mall',
      name: 'Tienda por Departamentos / Mayorista',
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>`
    },
    'bodegon': {
      id: 'bodegon',
      name: 'Bodegón / Importados',
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`
    }
  },

  // Helper para renderizar medios de productos
  renderProductMedia(product, sizeClass = 'w-12 h-12 text-lg') {
    if (product.image_type === 'photo' && product.image_data) {
      return `
        <div class="${sizeClass} rounded-xl overflow-hidden flex-shrink-0 bg-slate-900 border border-slate-700 shadow">
          <img src="${product.image_data}" alt="${product.name}" class="w-full h-full object-cover">
        </div>
      `;
    }
    const iconId = product.image_data || 'general';
    const def = this.products[iconId] || this.products['general'];
    return `
      <div class="${sizeClass} rounded-xl flex-shrink-0 flex items-center justify-center p-2.5 shadow" style="background-color: ${def.bg}; color: ${def.color};">
        ${def.svg}
      </div>
    `;
  },

  // Helper para renderizar medios de tiendas
  renderStoreMedia(store, sizeClass = 'w-14 h-14 text-xl') {
    if (store.image_type === 'photo' && store.image_data) {
      return `
        <div class="${sizeClass} rounded-2xl overflow-hidden flex-shrink-0 bg-slate-900 border border-slate-700 shadow">
          <img src="${store.image_data}" alt="${store.name}" class="w-full h-full object-cover">
        </div>
      `;
    }
    const iconId = store.image_data || 'supermarket';
    const def = this.stores[iconId] || this.stores['supermarket'];
    return `
      <div class="${sizeClass} rounded-2xl flex-shrink-0 flex items-center justify-center p-3 shadow" style="background-color: ${def.bg}; color: ${def.color};">
        ${def.svg}
      </div>
    `;
  }
};

window.AppIcons = AppIcons;
