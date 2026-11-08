// Módulo "Programar Mercado" - Optimizador Inteligente de Compras
class GroceryPlannerService {
  constructor() {
    this.userLocation = null;
  }

  async getUserLocation() {
    if (this.userLocation) return this.userLocation;
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          resolve(this.userLocation);
        },
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }

  /**
   * Calcula la distancia en kilómetros entre dos coordenadas GPS (Haversine)
   */
  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Analiza todas las tiendas contra la lista de productos y cantidades seleccionadas
   * @param {Array<string|Object>|Object} selectedInput - Lista de nombres o mapa { nombre: cantidad }
   */
  async planMarket(selectedInput) {
    let itemsMap = {};
    if (Array.isArray(selectedInput)) {
      for (const item of selectedInput) {
        if (typeof item === 'string') {
          itemsMap[item] = { qty: (itemsMap[item]?.qty || 0) + 1, amount: (itemsMap[item]?.amount || 0) + 1, isFree: false };
        } else if (item && item.name) {
          itemsMap[item.name] = {
            qty: parseFloat(item.qty || item.quantity) || 1,
            amount: parseFloat(item.amount !== undefined ? item.amount : (item.qty || item.quantity)) || 1,
            isFree: !!item.isFree,
            unit: item.unit || '',
            measureType: item.measureType || 'unidad'
          };
        }
      }
    } else if (selectedInput && typeof selectedInput === 'object') {
      for (const [k, v] of Object.entries(selectedInput)) {
        if (typeof v === 'number') {
          itemsMap[k] = { qty: v, amount: v, isFree: false };
        } else if (v && typeof v === 'object') {
          itemsMap[k] = {
            qty: parseFloat(v.qty) || 1,
            amount: parseFloat(v.amount !== undefined ? v.amount : v.qty) || 1,
            isFree: !!v.isFree,
            unit: v.unit || '',
            measureType: v.measureType || 'unidad'
          };
        }
      }
    }

    const selectedProductNames = Object.keys(itemsMap);

    if (!selectedProductNames || selectedProductNames.length === 0) {
      return {
        totalRequested: 0,
        recommendations: [],
        bestCheapest: null,
        bestClosest: null,
        bestRated: null
      };
    }

    const stores = await window.db.getStores();
    const allProducts = await window.db.getProducts();
    const userLoc = await this.getUserLocation();
    const currentRate = window.bcvService.rate;

    // Mapa de grupos de productos para optimización inteligente de canastas por grupos
    const groupsMap = new Map();
    if (window.productGroupingService) {
      try {
        const savedGroups = await window.productGroupingService.getSavedGroups();
        const builtGroups = window.productGroupingService.buildGroups(allProducts, savedGroups, currentRate);
        builtGroups.forEach(g => {
          groupsMap.set(g.name.trim().toLowerCase(), new Set(g.products.map(p => p.id)));
        });
      } catch (errG) {
        console.warn('Error al mapear grupos para el optimizador:', errG);
      }
    }

    const storeAnalysis = [];

    for (const store of stores) {
      const storeProducts = allProducts.filter(p => p.store_id === store.id);
      const available = [];
      const missing = [];

      let totalCostUSD = 0;
      let totalCostVES = 0;
      let ratingsSum = 0;
      let ratingsCount = 0;

      for (const targetName of selectedProductNames) {
        const itemEntry = itemsMap[targetName] || { qty: 1, amount: 1, isFree: false };
        const targetClean = targetName.trim().toLowerCase();

        // Buscar coincidencia en los productos de la tienda (por nombre exacto, subcadena o grupo)
        let found = storeProducts.find(p => {
          const pClean = p.name.trim().toLowerCase();
          return pClean === targetClean || pClean.includes(targetClean) || targetClean.includes(pClean);
        });

        // Si no se encontró por coincidencia directa de texto, verificar por grupo de productos
        if (!found && groupsMap.has(targetClean)) {
          const groupProductIds = groupsMap.get(targetClean);
          const storeGroupCandidates = storeProducts.filter(p => groupProductIds.has(p.id));
          if (storeGroupCandidates.length > 0) {
            // Seleccionar la opción más económica de ese grupo en esta tienda
            storeGroupCandidates.sort((a, b) => (parseFloat(a.current_price) || 0) - (parseFloat(b.current_price) || 0));
            found = storeGroupCandidates[0];
          }
        }

        if (found) {
          const m = (window.ProductUtils && typeof window.ProductUtils.normalizeProductMeasure === 'function')
            ? window.ProductUtils.normalizeProductMeasure(found)
            : { isFree: !!found.is_free_quantity, type: found.measure_type || 'unidad', amount: 1 };

          const isFree = itemEntry.isFree || m.isFree;
          const orderAmount = isFree ? (itemEntry.amount || 1) : (itemEntry.qty || 1);

          let priceUsd = parseFloat(found.current_price);
          let priceVes = priceUsd;

          if (found.original_currency === 'VES') {
            priceUsd = currentRate > 0 ? priceVes / currentRate : 0;
          } else {
            priceVes = priceUsd * currentRate;
          }

          const itemTotalUSD = priceUsd * orderAmount;
          const itemTotalVES = priceVes * orderAmount;

          totalCostUSD += itemTotalUSD;
          totalCostVES += itemTotalVES;

          if (found.rating && !isNaN(found.rating) && found.rating > 0) {
            ratingsSum += parseInt(found.rating);
            ratingsCount++;
          }

          const unitStr = isFree ? (itemEntry.unit || (m.type === 'peso' ? 'Kg' : (m.type === 'volumen' ? 'L' : 'Und'))) : '';
          const qtyLabel = isFree ? `${orderAmount} ${unitStr}`.trim() : `x${orderAmount}`;

          available.push({
            requestedName: targetName,
            quantity: qtyLabel,
            orderAmount: orderAmount,
            isFree: isFree,
            matchedProduct: found,
            unitPriceUSD: priceUsd,
            unitPriceVES: priceVes,
            totalPriceUSD: itemTotalUSD,
            totalPriceVES: itemTotalVES,
            rating: found.rating || null
          });
        } else {
          missing.push({
            name: targetName,
            quantity: itemEntry.isFree ? `${itemEntry.amount} ${itemEntry.unit || ''}`.trim() : `x${itemEntry.qty}`
          });
        }
      }

      // Distancia GPS
      let distanceKm = null;
      if (userLoc && store.lat && store.lng) {
        distanceKm = this.calculateDistanceKm(userLoc.lat, userLoc.lng, store.lat, store.lng);
      }

      // Promedio de valoración: primero de los productos encontrados en el carro
      let avgRating = ratingsCount > 0 ? (ratingsSum / ratingsCount) : null;
      // Si ninguno en el carro tiene estrellas, obtener el promedio general de productos calificados de la tienda
      if (avgRating === null) {
        const allStoreRated = storeProducts.filter(p => p.rating && !isNaN(p.rating) && p.rating > 0);
        if (allStoreRated.length > 0) {
          const sumAll = allStoreRated.reduce((acc, p) => acc + parseInt(p.rating, 10), 0);
          avgRating = sumAll / allStoreRated.length;
          ratingsCount = allStoreRated.length;
        }
      }

      const coverage = selectedProductNames.length > 0
        ? (available.length / selectedProductNames.length) * 100
        : 0;

      // Incluir todos los mercados por separado para comparación completa
      storeAnalysis.push({
        store,
        available,
        missing,
        coveragePercent: Math.round(coverage),
        totalCostUSD,
        totalCostVES,
        distanceKm,
        avgRating,
        ratingsCount
      });
    }

    if (storeAnalysis.length === 0) {
      return {
        totalRequested: selectedProductNames.length,
        recommendations: [],
        bestCheapest: null,
        bestClosest: null,
        bestRated: null
      };
    }

    // 1. Filtrar las que tienen mejor cobertura de productos (priorizar tiendas completas con >0 productos)
    const maxItemsAvailable = Math.max(...storeAnalysis.map(s => s.available.length), 0);
    const topCoverageStores = maxItemsAvailable > 0
      ? storeAnalysis.filter(s => s.available.length === maxItemsAvailable)
      : [];

    // 2. Opción A: La tienda más barata (de las que tienen mayor cobertura)
    const sortedByPrice = [...topCoverageStores].sort((a, b) => a.totalCostUSD - b.totalCostUSD);
    const bestCheapest = sortedByPrice[0] || null;

    // 3. Opción B: La tienda más cercana (con productos disponibles si es posible)
    const storesWithDistanceAndProds = storeAnalysis.filter(s => s.distanceKm !== null && s.available.length > 0);
    const storesWithDistanceAny = storeAnalysis.filter(s => s.distanceKm !== null);
    let bestClosest = null;
    if (storesWithDistanceAndProds.length > 0) {
      bestClosest = [...storesWithDistanceAndProds].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    } else if (storesWithDistanceAny.length > 0) {
      bestClosest = [...storesWithDistanceAny].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    } else {
      bestClosest = topCoverageStores[0] || storeAnalysis[0] || null;
    }

    // 4. Opción C: La tienda mejor valorada (según estrellas personales del usuario)
    const storesWithRatingAndProds = storeAnalysis.filter(s => s.avgRating !== null && s.available.length > 0);
    const storesWithRatingAny = storeAnalysis.filter(s => s.avgRating !== null);
    let bestRated = null;
    if (storesWithRatingAndProds.length > 0) {
      bestRated = [...storesWithRatingAndProds].sort((a, b) => b.avgRating - a.avgRating)[0];
    } else if (storesWithRatingAny.length > 0) {
      bestRated = [...storesWithRatingAny].sort((a, b) => b.avgRating - a.avgRating)[0];
    } else {
      bestRated = topCoverageStores[0] || storeAnalysis[0] || null;
    }

    // Lista general de todos los mercados ordenada por cobertura y luego precio
    const allSorted = [...storeAnalysis].sort((a, b) => {
      if (b.available.length !== a.available.length) {
        return b.available.length - a.available.length;
      }
      if (a.available.length > 0 && b.available.length > 0) {
        return a.totalCostUSD - b.totalCostUSD;
      }
      return a.store.name.localeCompare(b.store.name, 'es', { sensitivity: 'base' });
    });

    return {
      totalRequested: selectedProductNames.length,
      recommendations: allSorted,
      bestCheapest,
      bestClosest,
      bestRated
    };
  }
}

window.groceryPlanner = new GroceryPlannerService();
