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
          itemsMap[item] = (itemsMap[item] || 0) + 1;
        } else if (item && item.name) {
          itemsMap[item.name] = (itemsMap[item.name] || 0) + (parseInt(item.quantity) || 1);
        }
      }
    } else if (selectedInput && typeof selectedInput === 'object') {
      itemsMap = { ...selectedInput };
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
        const qty = itemsMap[targetName] || 1;
        const targetClean = targetName.trim().toLowerCase();

        // Buscar coincidencia en los productos de la tienda
        const found = storeProducts.find(p => {
          const pClean = p.name.trim().toLowerCase();
          return pClean === targetClean || pClean.includes(targetClean) || targetClean.includes(pClean);
        });

        if (found) {
          let priceUsd = parseFloat(found.current_price);
          let priceVes = priceUsd;

          if (found.original_currency === 'VES') {
            priceUsd = currentRate > 0 ? priceVes / currentRate : 0;
          } else {
            priceVes = priceUsd * currentRate;
          }

          totalCostUSD += (priceUsd * qty);
          totalCostVES += (priceVes * qty);

          if (found.rating && !isNaN(found.rating) && found.rating > 0) {
            ratingsSum += parseInt(found.rating);
            ratingsCount++;
          }

          available.push({
            requestedName: targetName,
            quantity: qty,
            matchedProduct: found,
            unitPriceUSD: priceUsd,
            unitPriceVES: priceVes,
            totalPriceUSD: priceUsd * qty,
            totalPriceVES: priceVes * qty,
            rating: found.rating || null
          });
        } else {
          missing.push({ name: targetName, quantity: qty });
        }
      }

      // Distancia GPS
      let distanceKm = null;
      if (userLoc && store.lat && store.lng) {
        distanceKm = this.calculateDistanceKm(userLoc.lat, userLoc.lng, store.lat, store.lng);
      }

      const avgRating = ratingsCount > 0 ? (ratingsSum / ratingsCount) : null;
      const coverage = (available.length / selectedProductNames.length) * 100;

      if (available.length > 0) {
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

    // 1. Filtrar las que tienen mejor cobertura de productos (priorizar tiendas completas)
    const maxItemsAvailable = Math.max(...storeAnalysis.map(s => s.available.length));
    const topCoverageStores = storeAnalysis.filter(s => s.available.length === maxItemsAvailable);

    // 2. Opción A: La tienda más barata (de las que tienen mayor cobertura)
    const sortedByPrice = [...topCoverageStores].sort((a, b) => a.totalCostUSD - b.totalCostUSD);
    const bestCheapest = sortedByPrice[0] || null;

    // 3. Opción B: La tienda más cercana
    const storesWithDistance = storeAnalysis.filter(s => s.distanceKm !== null);
    let bestClosest = null;
    if (storesWithDistance.length > 0) {
      bestClosest = [...storesWithDistance].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    } else {
      // Si no hay GPS activo, tomar la primera de mejor cobertura
      bestClosest = topCoverageStores[0] || null;
    }

    // 4. Opción C: La tienda mejor valorada (según estrellas personales del usuario)
    const storesWithRating = storeAnalysis.filter(s => s.avgRating !== null);
    let bestRated = null;
    if (storesWithRating.length > 0) {
      bestRated = [...storesWithRating].sort((a, b) => b.avgRating - a.avgRating)[0];
    } else {
      bestRated = topCoverageStores[0] || null;
    }

    // Lista general ordenada por cobertura (primero las que tienen todo) y luego por precio
    const allSorted = [...storeAnalysis].sort((a, b) => {
      if (b.available.length !== a.available.length) {
        return b.available.length - a.available.length;
      }
      return a.totalCostUSD - b.totalCostUSD;
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
