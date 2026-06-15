    // ================================================================
    // STATE
    // ================================================================
    // Sample budget defaults (all editable in Settings). Your real numbers are
    // stored privately in IndexedDB + your own Google Drive — never in this file.
    const DEFAULT_BUDGETS = { rent: 800, food: 325, transport: 100, shopping: 100, subscriptions: 50, remittance: 600, insurance: 30, installments: 50, health: 80, entertainment: 60, other: 835 };

    // User-defined categorization rules. Evaluated in order, BEFORE the generic
    // regex fallback in autoCategory(). `match` is a case-insensitive substring;
    // for "all words" matching, separate terms with '&' (e.g. "paypal & telekom").
    // `field` = desc | type | both. Amount bounds are optional, on Math.abs(amount).
    const DEFAULT_RULES = [
      { id: 'r-remittance', enabled: true, match: 'khawaja umair-ul-hassan & revolut', field: 'both', minAmount: 450, maxAmount: 800, category: 'remittance' },
      { id: 'r-telekom', enabled: true, match: 'paypal & telekom', field: 'both', minAmount: null, maxAmount: null, category: 'subscriptions' },
      { id: 'r-popsure', enabled: true, match: 'popsure', field: 'both', minAmount: null, maxAmount: null, category: 'insurance' },
      { id: 'r-zinia', enabled: true, match: 'zinia', field: 'both', minAmount: 45, maxAmount: 55, category: 'installments' },
      { id: 'r-klarna', enabled: true, match: 'klarna', field: 'both', minAmount: null, maxAmount: null, category: 'shopping' },
      { id: 'r-subs', enabled: true, match: 'disney', field: 'both', minAmount: null, maxAmount: null, category: 'subscriptions' }
    ];
    const S = {
      transactions: [], portfolioEntries: [], balanceHistory: [], loggedMonths: new Set(),
      config: {
        currentSparkasseBalance: null, sparkasseTarget: 10000, monthlyIncome: 3000, cycleStartDay: 1,
        budgets: { ...DEFAULT_BUDGETS }, customCategories: [], rules: DEFAULT_RULES.map(r => ({ ...r }))
      }
    };
    const charts = {};
    let activeTab = 'overview';
    let monthlySnapshots = [];

