    // ================================================================
    // SPENDING
    // ================================================================
    function renderSpending() {
      const monthSel = document.getElementById('spendMonth').value;
      const snap = monthlySnapshots.find(s => s.month === monthSel) || monthlySnapshots[monthlySnapshots.length - 1];
      if (!snap) { document.getElementById('spendEmpty').style.display = 'block'; document.getElementById('spendCards').innerHTML = ''; return; }
      document.getElementById('spendEmpty').style.display = 'none';
      const budgets = S.config.budgets, totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
      const savings3 = monthlySnapshots.slice(-3).map(s => s.savingsRate), avgSav = savings3.length ? savings3.reduce((a, b) => a + b, 0) / savings3.length : 0;
      const overSpend = Object.entries(budgets).map(([cat, bud]) => ({ cat, over: (snap.byCategory[cat] || 0) - bud })).filter(x => x.over > 0).sort((a, b) => b.over - a.over)[0];
      document.getElementById('spendCards').innerHTML = `
    <div class="card"><div class="card-title">Total This Month</div><div class="card-value" style="color:${snap.totalSpending > totalBudget ? 'var(--red)' : 'var(--green)'}">${fmtEur(snap.totalSpending)}</div><div class="card-sub">Budget: ${fmtEur(totalBudget)}</div></div>
    <div class="card"><div class="card-title">Biggest Overspend</div><div class="card-value" style="color:var(--red)">${overSpend ? overSpend.cat : '—'}</div><div class="card-sub">${overSpend ? `+${fmtEur(overSpend.over)} over` : 'On track!'}</div></div>
    <div class="card"><div class="card-title">Income This Month</div><div class="card-value" style="color:var(--green)">${fmtEur(snap.totalIncome)}</div><div class="card-sub">${(snap.savingsRate * 100).toFixed(1)}% savings rate</div></div>
    <div class="card"><div class="card-title">Avg Savings (3mo)</div><div class="card-value" style="color:${avgSav >= .3 ? 'var(--green)' : avgSav < 0 ? 'var(--red)' : 'var(--yellow)'}">${(avgSav * 100).toFixed(1)}%</div><div class="card-sub">Target ≥30%</div></div>`;
      renderBudgetChart(snap); renderMoMChart(); renderSpendTable(snap);
    }

    function renderBudgetChart(snap) {
      const cats = Object.keys(S.config.budgets), buds = cats.map(c => S.config.budgets[c]), acts = cats.map(c => snap.byCategory[c] || 0);
      const colors = acts.map((a, i) => { const p = buds[i] > 0 ? a / buds[i] : 0; return p > 1 ? 'rgba(239,68,68,.8)' : p > .8 ? 'rgba(245,158,11,.8)' : 'rgba(16,185,129,.8)'; });
      destroyChart('chartBudget');
      charts['chartBudget'] = new Chart(document.getElementById('chartBudget'), { type: 'bar', data: { labels: cats, datasets: [{ label: 'Budget', data: buds, backgroundColor: 'rgba(100,116,139,.3)', borderColor: 'rgba(100,116,139,.6)', borderWidth: 1 }, { label: 'Actual', data: acts, backgroundColor: colors }] }, options: { ...chartDefaults(), indexAxis: 'y', scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8892b0', callback: v => `€${v}` } }, y: { grid: { display: false }, ticks: { color: '#8892b0' } } } } });
    }

    function renderMoMChart() {
      const snaps = monthlySnapshots.slice(-6); if (snaps.length < 2) return;
      const catTotals = {}; snaps.forEach(s => Object.entries(s.byCategory).forEach(([c, v]) => catTotals[c] = (catTotals[c] || 0) + v));
      const top5 = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
      const lc = ['#6c63ff', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
      destroyChart('chartMoM');
      charts['chartMoM'] = new Chart(document.getElementById('chartMoM'), { type: 'line', data: { labels: snaps.map(s => s.month), datasets: top5.map((cat, i) => ({ label: cat, data: snaps.map(s => s.byCategory[cat] || 0), borderColor: lc[i], tension: .4, pointRadius: 3, fill: false })) }, options: chartDefaults() });
    }

    function renderSpendTable(snap) {
      const cats = Object.keys(S.config.budgets), recent3 = monthlySnapshots.slice(-4, -1);
      document.getElementById('spendTable').innerHTML = cats.map(cat => {
        const bud = S.config.budgets[cat] || 0, act = snap.byCategory[cat] || 0, delta = act - bud, pct = bud > 0 ? act / bud : 0;
        const status = pct > 1 ? '🔴 Over' : pct > .8 ? '🟡 Near' : '🟢 OK', color = pct > 1 ? 'var(--red)' : pct > .8 ? 'var(--yellow)' : 'var(--green)';
        const prevVals = recent3.map(s => s.byCategory[cat] || 0);
        let trend = '<span class="trend-flat">→</span>';
        if (prevVals.length >= 2) { const avg = prevVals.reduce((a, b) => a + b, 0) / prevVals.length; if (act > avg * 1.1) trend = '<span class="trend-up">↑</span>'; else if (act < avg * 0.9) trend = '<span class="trend-down">↓</span>'; }
        return `<tr><td style="font-weight:500">${cat}</td><td>${fmtEur(bud)}</td><td style="font-weight:600">${fmtEur(act)}</td><td style="color:${delta > 0 ? 'var(--red)' : 'var(--green)'}">${delta > 0 ? '+' : ''}${fmtEur(delta)}</td><td><div style="display:flex;align-items:center;gap:7px"><div class="prog-wrap" style="width:55px"><div class="prog-bar ${pct > 1 ? 'prog-red' : pct > .8 ? 'prog-yellow' : 'prog-green'}" style="width:${Math.min(pct * 100, 100)}%"></div></div>${bud > 0 ? (pct * 100).toFixed(0) + '%' : '—'}</div></td><td>${trend}</td><td style="color:${color}">${status}</td></tr>`;
      }).join('');
    }

