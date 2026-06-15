    // ================================================================
    // LOAD / SAVE
    // ================================================================
    async function loadAll() {
      S.transactions = await dbGetAll('transactions');
      S.portfolioEntries = await dbGetAll('portfolioEntries');
      S.balanceHistory = await dbGetAll('balanceHistory');
      S.transactions.sort((a, b) => b.date.localeCompare(a.date));
      S.portfolioEntries.sort((a, b) => a.date.localeCompare(b.date));
      S.balanceHistory.sort((a, b) => a.date.localeCompare(b.date));
      S.loggedMonths = new Set(S.transactions.map(t => t.date.slice(0, 7)));
      const cfg = await dbGetConfig('main');
      if (cfg) {
        Object.assign(S.config, cfg);
        S.config.budgets = Object.assign({ ...DEFAULT_BUDGETS }, cfg.budgets || {});
        S.config.customCategories = cfg.customCategories || [];
        S.config.rules = Array.isArray(cfg.rules) ? cfg.rules : DEFAULT_RULES.map(r => ({ ...r }));
        S.config.plan = (cfg.plan && Array.isArray(cfg.plan.phases) && cfg.plan.phases.length)
          ? cfg.plan : JSON.parse(JSON.stringify(DEFAULT_PLAN));
      }
    }

    async function saveConfig() {
      S.config.currentSparkasseBalance = parseFloat(document.getElementById('cfg-sparkasse').value) || null;
      S.config.sparkasseTarget = parseFloat(document.getElementById('cfg-target').value) || 10000;
      S.config.monthlyIncome = parseFloat(document.getElementById('cfg-income').value) || 2800;
      S.config.cycleStartDay = parseInt(document.getElementById('cfg-cycleday').value) || 1;
      document.querySelectorAll('[data-budget]').forEach(el => { S.config.budgets[el.dataset.budget] = parseFloat(el.value) || 0; });
      await dbSetConfig('main', S.config);
      rebuildAll();
    }

    function loadConfigUI() {
      const c = S.config;
      if (c.currentSparkasseBalance != null) document.getElementById('cfg-sparkasse').value = c.currentSparkasseBalance;
      document.getElementById('cfg-target').value = c.sparkasseTarget || 10000;
      document.getElementById('cfg-income').value = c.monthlyIncome || 2800;
      document.getElementById('cfg-cycleday').value = c.cycleStartDay || 1;
    }

    function buildBudgetFields() {
      const cats = ['rent', 'food', 'transport', 'shopping', 'subscriptions', 'remittance', 'insurance', 'installments', 'health', 'entertainment', 'other'];
      const labels = { rent: 'Rent', food: 'Food & Dining', transport: 'Transport', shopping: 'Shopping', subscriptions: 'Subscriptions', remittance: 'Remittance (family)', insurance: 'Insurance', installments: 'Installments', health: 'Health', entertainment: 'Entertainment', other: 'Other' };
      document.getElementById('budgetFields').innerHTML = cats.map(c => `<div class="field"><label>${labels[c]}</label><input data-budget="${c}" type="number" value="${S.config.budgets[c] || 0}" oninput="saveConfig()"></div>`).join('');
      renderCustomCatList();
      renderRulesList();
      renderPhasesList();
      refreshCategorySelects();
    }

    // ---- Projection plan UI ----
    function ensurePlan() { if (!S.config.plan || !Array.isArray(S.config.plan.phases)) S.config.plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); return S.config.plan; }
    function persistPlan() { return dbSetConfig('main', S.config); }
    function renderPhasesList() {
      const plan = ensurePlan();
      const rEl = document.getElementById('cfg-return'); if (rEl && document.activeElement !== rEl) rEl.value = plan.annualReturnPct;
      const eEl = document.getElementById('cfg-planend'); if (eEl && document.activeElement !== eEl) eEl.value = plan.end;
      const el = document.getElementById('phasesList'); if (!el) return;
      const phases = [...plan.phases].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      if (!phases.length) { el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px 0">No phases yet. Add one below.</div>'; return; }
      el.innerHTML = phases.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name || 'Phase')}</div>
        <div style="font-size:11px;color:var(--muted)">from ${esc(p.start || '?')} · €${p.sparkasseMonthly || 0}/mo Sparkasse · €${p.invest || 0}/mo invest</div>
      </div>
      <button onclick="deletePhase(${i})" style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px;flex:0 0 auto">✕</button>
    </div>`).join('');
    }
    async function savePlanMeta() {
      const plan = ensurePlan();
      const r = parseFloat(document.getElementById('cfg-return').value);
      const e = document.getElementById('cfg-planend').value;
      if (!isNaN(r)) plan.annualReturnPct = r;
      if (e) plan.end = e;
      await persistPlan();
      if (activeTab === 'projections' || activeTab === 'overview') rebuildAll();
    }
    async function addPhase() {
      const plan = ensurePlan();
      const name = (document.getElementById('newPhaseName').value || '').trim() || ('Phase ' + (plan.phases.length + 1));
      const start = document.getElementById('newPhaseStart').value;
      if (!start) { showToast('⚠️ Pick a start month'); return; }
      const sparkasseMonthly = parseFloat(document.getElementById('newPhaseSpark').value) || 0;
      const invest = parseFloat(document.getElementById('newPhaseInvest').value) || 0;
      plan.phases.push({ name, start, sparkasseMonthly, invest });
      plan.phases.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      document.getElementById('newPhaseName').value = '';
      document.getElementById('newPhaseStart').value = '';
      document.getElementById('newPhaseSpark').value = '';
      document.getElementById('newPhaseInvest').value = '';
      await persistPlan(); renderPhasesList(); rebuildAll();
      showToast('✅ Phase added');
    }
    async function deletePhase(i) {
      const plan = ensurePlan();
      const sorted = [...plan.phases].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const target = sorted[i]; if (!target) return;
      plan.phases = plan.phases.filter(p => p !== target);
      await persistPlan(); renderPhasesList(); rebuildAll();
    }

    // ---- Categorization rules UI ----
    function persistRules() { return dbSetConfig('main', S.config); }

    function renderRulesList() {
      const el = document.getElementById('rulesList'); if (!el) return;
      const rules = S.config.rules || [];
      const catSel = document.getElementById('newRuleCat');
      if (catSel) catSel.innerHTML = categoryOptions(catSel.value || 'shopping');
      if (!rules.length) { el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px 0">No rules yet. Add one below.</div>'; return; }
      el.innerHTML = rules.map((r, i) => {
        const range = (r.minAmount != null || r.maxAmount != null) ? ` · ${r.minAmount ?? '0'}–${r.maxAmount ?? '∞'}€` : '';
        return `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);${r.enabled === false ? 'opacity:.45' : ''}">
      <input type="checkbox" ${r.enabled === false ? '' : 'checked'} onchange="toggleRule(${i})" style="width:auto;flex:0 0 auto" title="Enable/disable">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.match)}<span style="color:var(--muted);font-weight:400">${range}</span></div>
        <div style="font-size:11px;color:var(--muted)">→ <span style="color:${({}[r.category]) || 'var(--accent)'}">${esc(r.category)}</span></div>
      </div>
      <button onclick="deleteRule(${i})" style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px;flex:0 0 auto">✕</button>
    </div>`;
      }).join('');
    }

    async function addRule() {
      const match = (document.getElementById('newRuleMatch').value || '').trim();
      if (!match) { showToast('⚠️ Enter match text'); return; }
      const minV = document.getElementById('newRuleMin').value, maxV = document.getElementById('newRuleMax').value;
      const category = document.getElementById('newRuleCat').value;
      if (!S.config.rules) S.config.rules = [];
      S.config.rules.push({
        id: 'r-' + Date.now().toString(36), enabled: true, match, field: 'both',
        minAmount: minV !== '' ? parseFloat(minV) : null,
        maxAmount: maxV !== '' ? parseFloat(maxV) : null,
        category
      });
      document.getElementById('newRuleMatch').value = '';
      document.getElementById('newRuleMin').value = '';
      document.getElementById('newRuleMax').value = '';
      await persistRules();
      renderRulesList();
      showToast('✅ Rule added — tap "Apply rules" to re-categorize');
    }

    async function toggleRule(i) {
      const r = S.config.rules[i]; if (!r) return;
      r.enabled = r.enabled === false;
      await persistRules(); renderRulesList();
    }

    async function deleteRule(i) {
      if (!S.config.rules[i]) return;
      S.config.rules.splice(i, 1);
      await persistRules(); renderRulesList();
    }

    function allCategories() {
      const BUILTIN = ['rent', 'food', 'transport', 'shopping', 'subscriptions', 'remittance', 'insurance', 'installments', 'health', 'income', 'investment', 'entertainment', 'transfer', 'other'];
      return [...BUILTIN, ...(S.config.customCategories || []).filter(c => !BUILTIN.includes(c))];
    }
    function categoryOptions(selected) {
      return allCategories().map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
    }
    function refreshCategorySelects() {
      const el = document.getElementById('txCat');
      if (el) el.innerHTML = '<option value="">All Categories</option>' + allCategories().map(c => `<option value="${c}">${c}</option>`).join('');
    }
    function renderCustomCatList() {
      const cats = S.config.customCategories || [];
      const el = document.getElementById('customCatList'); if (!el) return;
      if (!cats.length) { el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px 0">No custom categories yet. Examples: installments, creditcard, zakat</div>'; return; }
      el.innerHTML = cats.map(name => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px;font-weight:500">${esc(name)}</span>
      <label style="font-size:11px;color:var(--muted)">€</label>
      <input data-budget="${esc(name)}" type="number" value="${S.config.budgets[name] || 0}"
        style="width:80px;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:5px;font-size:12px"
        oninput="saveConfig()">
      <button onclick="removeCustomCategory('${esc(name)}')"
        style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">✕</button>
    </div>`).join('');
    }
    async function addCustomCategory() {
      const nameEl = document.getElementById('newCatName'), budgetEl = document.getElementById('newCatBudget');
      const name = (nameEl.value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!name) { showToast('⚠️ Enter a category name'); return; }
      const BUILTIN = ['rent', 'food', 'transport', 'shopping', 'subscriptions', 'remittance', 'insurance', 'installments', 'health', 'income', 'investment', 'entertainment', 'transfer', 'other'];
      if (BUILTIN.includes(name)) { showToast('⚠️ That is a built-in category'); return; }
      if (!S.config.customCategories) S.config.customCategories = [];
      if (S.config.customCategories.includes(name)) { showToast('⚠️ Category already exists'); return; }
      const budget = parseFloat(budgetEl.value) || 0;
      S.config.customCategories.push(name);
      S.config.budgets[name] = budget;
      nameEl.value = ''; budgetEl.value = '';
      await dbSetConfig('main', S.config);
      buildBudgetFields(); rebuildAll();
      showToast('✅ Added category: ' + name);
    }
    async function removeCustomCategory(name) {
      if (!confirm(`Remove category "${name}"? Transactions will move to "other".`)) return;
      S.transactions.filter(t => t.category === name).forEach(t => { t.category = 'other'; dbPut('transactions', t); });
      S.config.customCategories = (S.config.customCategories || []).filter(c => c !== name);
      delete S.config.budgets[name];
      await dbSetConfig('main', S.config);
      rebuildSnapshots(); buildBudgetFields(); rebuildAll();
      showToast(`✅ Category "${name}" removed`);
    }

