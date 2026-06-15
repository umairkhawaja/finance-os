    // ================================================================
    // RISK
    // ================================================================
    function computeRiskFlags() {
      const flags = []; if (!monthlySnapshots.length) return flags;
      const latest = monthlySnapshots[monthlySnapshots.length - 1], recent3 = monthlySnapshots.slice(-3), budgets = S.config.budgets;
      Object.keys(budgets).forEach(cat => {
        const avg = recent3.reduce((s, m) => s + (m.byCategory[cat] || 0), 0) / recent3.length, bud = budgets[cat] || 0;
        if (bud > 0 && avg > bud) { const pct = (avg / bud * 100).toFixed(0); flags.push({ id: `overage-${cat}`, severity: pct > 130 ? 'high' : 'medium', icon: '💸', title: `${cat} over budget (avg ${pct}%)`, detail: `Avg: ${fmtEur(avg)} vs budget ${fmtEur(bud)}`, action: `Cut ${cat} by ${fmtEur(avg - bud)}/month`, msg: `${cat} over budget at ${pct}%` }); }
      });
      if (latest.savingsRate < 0.3) flags.push({ id: 'savings-low', severity: latest.savingsRate < 0.15 ? 'high' : 'medium', icon: '📉', title: `Low savings rate: ${(latest.savingsRate * 100).toFixed(1)}%`, detail: 'Target ≥30%.', action: 'Review spending', msg: `Savings rate only ${(latest.savingsRate * 100).toFixed(1)}%` });
      const series = generateProjectionSeries(), today = new Date().toISOString().slice(0, 7), pIdx = series.labels.indexOf(today);
      if (pIdx >= 0 && S.config.currentSparkasseBalance != null) { const proj = series.sparkasse[pIdx], actual = S.config.currentSparkasseBalance; if (actual < proj * 0.9) flags.push({ id: 'sparkasse-behind', severity: actual < proj * 0.8 ? 'high' : 'medium', icon: '🏦', title: `Sparkasse ${((1 - actual / proj) * 100).toFixed(0)}% below projection`, detail: `Expected ${fmtEur(proj)}, actual ${fmtEur(actual)}`, action: 'Increase monthly transfers', msg: `Sparkasse behind by ${fmtEur(proj - actual)}` }); }
      monthlySnapshots.slice(-3).forEach(snap => { if ((snap.byCategory.other || 0) > 500) flags.push({ id: `other-${snap.month}`, severity: 'medium', icon: '❓', title: `"Other" spike in ${snap.month}`, detail: `${fmtEur(snap.byCategory.other)} uncategorized`, action: 'Reclassify in Transactions tab', msg: `Other spike: ${fmtEur(snap.byCategory.other)}` }); });
      return flags;
    }

    function computeHealthScore(flags) { let s = 100; flags.forEach(f => { if (f.severity === 'high') s -= 20; else if (f.severity === 'medium') s -= 10; else s -= 5; }); return Math.max(0, s); }

    function renderRisk() {
      if (!monthlySnapshots.length) { document.getElementById('riskEmpty').style.display = 'block'; document.getElementById('riskFlags').innerHTML = ''; document.getElementById('healthScore').textContent = '—'; return; }
      document.getElementById('riskEmpty').style.display = 'none';
      const flags = computeRiskFlags(), score = computeHealthScore(flags);
      const el = document.getElementById('healthScore'); el.textContent = score; el.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';
      document.getElementById('healthDesc').textContent = score >= 80 ? 'Excellent!' : score >= 60 ? 'Needs attention' : 'Critical!';
      drawGauge(score);
      const high = flags.filter(f => f.severity === 'high').length, med = flags.filter(f => f.severity === 'medium').length, low = flags.filter(f => f.severity === 'low').length;
      document.getElementById('riskSummary').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><span>🔴 High</span><span style="font-weight:700;color:var(--red)">${high}</span></div><div style="display:flex;justify-content:space-between"><span>🟡 Medium</span><span style="font-weight:700;color:var(--yellow)">${med}</span></div><div style="display:flex;justify-content:space-between"><span>🔵 Low</span><span style="font-weight:700;color:var(--blue)">${low}</span></div><div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px"><span>Total</span><span style="font-weight:700">${flags.length}</span></div></div>`;
      if (!flags.length) { document.getElementById('riskFlags').innerHTML = `<div class="flag-card" style="border-color:var(--green)"><div class="flag-icon">✅</div><div class="flag-body"><div class="flag-title" style="color:var(--green)">All clear! No risk flags.</div></div></div>`; return; }
      document.getElementById('riskFlags').innerHTML = [...flags].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity])).map(f => `<div class="flag-card" style="border-left:3px solid ${f.severity === 'high' ? 'var(--red)' : f.severity === 'medium' ? 'var(--yellow)' : 'var(--blue)'}"><div class="flag-icon">${f.icon}</div><div class="flag-body"><div style="display:flex;align-items:center;gap:7px;margin-bottom:3px"><span class="flag-title">${f.title}</span><span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span></div><div class="flag-detail">${f.detail}</div><div class="flag-action">💡 ${f.action}</div></div></div>`).join('');
    }

    function drawGauge(score) {
      const cv = document.getElementById('healthGauge'), ctx = cv.getContext('2d'), cx = 50, cy = 50, r = 38;
      ctx.clearRect(0, 0, 100, 100);
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 10; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + (score / 100) * Math.PI); ctx.strokeStyle = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'; ctx.lineWidth = 10; ctx.stroke();
    }

