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
    // Projection plan. The engine (generateProjectionSeries) is driven entirely by
    // this — phases, monthly amounts, blended return and the horizon are all editable
    // in Settings rather than hardcoded. Each phase begins at `start` (YYYY-MM) and
    // runs until the next phase's start (or `end`). `sparkasseMonthly` is added to the
    // Sparkasse each month (capped at sparkasseTarget); `invest` is added to the
    // portfolio, which compounds at annualReturnPct.
    const DEFAULT_PLAN = {
      annualReturnPct: 7,
      end: '2028-10',
      phases: [
        { name: 'Phase 1 — Safety Net', start: '2026-06', sparkasseMonthly: 1000, invest: 0 },
        { name: 'Phase 2 — Invest €1k/mo', start: '2026-10', sparkasseMonthly: 0, invest: 1000 },
        { name: 'Phase 3 — Scale €1.5k/mo', start: '2028-01', sparkasseMonthly: 0, invest: 1500 }
      ]
    };
    const S = {
      transactions: [], portfolioEntries: [], balanceHistory: [], loggedMonths: new Set(),
      config: {
        currentSparkasseBalance: null, sparkasseTarget: 10000, monthlyIncome: 3000, cycleStartDay: 1,
        budgets: { ...DEFAULT_BUDGETS }, customCategories: [], rules: DEFAULT_RULES.map(r => ({ ...r })),
        plan: JSON.parse(JSON.stringify(DEFAULT_PLAN))
      }
    };
    const charts = {};
    let activeTab = 'overview';
    let monthlySnapshots = [];

