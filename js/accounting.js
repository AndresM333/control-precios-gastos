// Módulo de Contabilidad y Control de Gastos Diarios
class AccountingService {
  constructor() {
    this.currentPeriod = 'MONTH'; // 'TODAY', 'WEEK', 'MONTH', 'ALL'
  }

  setPeriod(period) {
    this.currentPeriod = period;
  }

  async getFilteredExpenses(period = null) {
    const p = period || this.currentPeriod;
    const all = await window.db.getExpenses();
    const now = new Date();

    if (p === 'TODAY') {
      const todayStr = now.toISOString().split('T')[0];
      return all.filter(e => e.date === todayStr);
    } else if (p === 'WEEK') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      return all.filter(e => new Date(e.date) >= oneWeekAgo);
    } else if (p === 'MONTH') {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      return all.filter(e => {
        const d = new Date(e.date);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      });
    }

    return all;
  }

  /**
   * Calcula totales en USD, VES y resumen por categoría
   */
  async getSummary(period = null) {
    const expenses = await this.getFilteredExpenses(period);
    const currentRate = window.bcvService.rate;

    let totalUSD = 0;
    let totalVES = 0;
    let invoiceExpensesCount = 0;
    let manualExpensesCount = 0;

    const categoriesMap = {};

    for (const exp of expenses) {
      let usd = parseFloat(exp.amount_usd) || 0;
      let ves = parseFloat(exp.amount_ves) || 0;

      // Si por alguna razón faltaba uno de los dos
      if (usd === 0 && ves > 0) {
        usd = window.bcvService.vesToUsd(ves, exp.bcv_rate || currentRate);
      } else if (ves === 0 && usd > 0) {
        ves = window.bcvService.usdToVes(usd, exp.bcv_rate || currentRate);
      }

      totalUSD += usd;
      totalVES += ves;

      if (exp.source === 'FACTURA') {
        invoiceExpensesCount++;
      } else {
        manualExpensesCount++;
      }

      const cat = exp.category || 'Otros';
      if (!categoriesMap[cat]) {
        categoriesMap[cat] = { name: cat, totalUSD: 0, totalVES: 0, count: 0 };
      }
      categoriesMap[cat].totalUSD += usd;
      categoriesMap[cat].totalVES += ves;
      categoriesMap[cat].count++;
    }

    const categoriesArray = Object.values(categoriesMap).map(c => {
      const pct = totalUSD > 0 ? ((c.totalUSD / totalUSD) * 100).toFixed(1) : 0;
      return { ...c, percentage: parseFloat(pct) };
    }).sort((a, b) => b.totalUSD - a.totalUSD);

    return {
      period: period || this.currentPeriod,
      totalUSD,
      totalVES,
      count: expenses.length,
      invoiceExpensesCount,
      manualExpensesCount,
      categories: categoriesArray,
      expenses
    };
  }

  /**
   * Crea un gasto manual
   */
  async addManualExpense({ concept, category, amount, currency, date, note }) {
    const currentRate = window.bcvService.rate;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      throw new Error('El monto del gasto debe ser mayor a 0');
    }

    const curr = (currency || 'USD').toUpperCase();
    let amountUsd = val;
    let amountVes = val;

    if (curr === 'USD') {
      amountVes = window.bcvService.usdToVes(val, currentRate);
    } else {
      amountUsd = window.bcvService.vesToUsd(val, currentRate);
    }

    const newExpense = {
      invoice_id: null,
      date: date || new Date().toISOString().split('T')[0],
      concept: (concept || 'Gasto manual').trim(),
      category: category || 'Otros',
      amount_usd: amountUsd,
      amount_ves: amountVes,
      original_currency: curr,
      bcv_rate: currentRate,
      source: 'MANUAL',
      note: (note || '').trim()
    };

    const id = await window.db.saveExpense(newExpense);
    newExpense.id = id;
    return newExpense;
  }
}

window.accountingService = new AccountingService();
