    // ================================================================
    // PROJECTIONS — default 3-phase plan (all values editable in Settings)
    // ================================================================
    // Phase 1 Jun–Sep 2026:  Save €1,000/mo to Sparkasse → target €10k. No investing.
    // Phase 2 Oct 2026–Dec 2027: Sparkasse stays at €10k. €1,000/mo → Scalable Capital.
    //   Allocation: HSBC Islamic ETF €500 | NVIDIA €150 | Apple €100 | Xetra-Gold €150 | Cash €100
    // Phase 3 Jan 2028–Oct 2028: Sparkasse stays at €10k. €1,500/mo → Scalable Capital.
    //   Allocation scaled 50/15/10/15/10% → €750/€225/€150/€225/€150
    // Conservative return: 7% blended annual (ETF ~6%, stocks ~8%, gold ~5%)
    // ================================================================
    // END-OF-MONTH FORECAST
    // ================================================================
    // Returns the current spend cycle window [start, end) honoring cycleStartDay.
    function currentCycle() {
      const now = new Date();
      const startDay = Math.min(Math.max(parseInt(S.config.cycleStartDay) || 1, 1), 28);
      let start = new Date(now.getFullYear(), now.getMonth(), startDay);
      if (now < start) start = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay); // exclusive
      const MS = 86400000;
      const daysTotal = Math.round((end - start) / MS);
      const daysElapsed = Math.min(daysTotal, Math.max(1, Math.floor((now - start) / MS) + 1));
      const daysRemaining = Math.max(0, daysTotal - daysElapsed);
      return { start, end, daysTotal, daysElapsed, daysRemaining };
    }

    // Forecasts the end-of-cycle Sparkasse balance two ways. Income is intentionally
    // ignored — this projects how far *expenses* will draw the current balance down:
    //  1) "trend"  — likely outcome: recent 3-month spend pace blended with this
    //                cycle's actual pace so far (the further into the cycle, the more
    //                weight the live pace gets).
    //  2) "budget" — conservative ceiling: you spend every euro of remaining budget.
    // Both start from the current balance (which already reflects spend to date) and
    // subtract only the *remaining* projected spend. Returns null if no balance.
    function forecastMonthEnd() {
      const balance = S.config.currentSparkasseBalance;
      if (balance == null) return null;
      const cyc = currentCycle();
      const startISO = cyc.start.toISOString().slice(0, 10);
      const endISO = cyc.end.toISOString().slice(0, 10);
      const inCycle = S.transactions.filter(t => t.date >= startISO && t.date < endISO);
      // Expenses only — income (amount > 0) plays no part in the spend forecast.
      const spentSoFar = Math.abs(inCycle.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));

      // --- Budget scenario: spend the full remaining budget allowance this cycle ---
      const totalBudget = Object.values(S.config.budgets || {}).reduce((s, v) => s + (v || 0), 0);
      const plannedRemaining = Math.max(totalBudget - spentSoFar, 0);
      const endBudget = balance - plannedRemaining;

      // --- Trend scenario: blend recent history with this cycle's live pace ---
      // Average of the last 3 *completed* calendar months (the current, incomplete
      // month is excluded so a half-finished month never deflates the average).
      const curMonth = new Date().toISOString().slice(0, 7);
      const completed = monthlySnapshots.filter(s => s.month < curMonth);
      const last3 = completed.slice(-3);
      const avgAvailable = last3.length > 0;
      const avg3 = avgAvailable ? last3.reduce((s, m) => s + m.totalSpending, 0) / last3.length : 0;

      const histDaily = cyc.daysTotal > 0 ? avg3 / cyc.daysTotal : 0;          // historical €/day
      const curDaily = cyc.daysElapsed > 0 ? spentSoFar / cyc.daysElapsed : 0; // this cycle's €/day
      // Weight the live pace more as the cycle progresses; lean on history early on.
      const w = Math.min(cyc.daysElapsed / cyc.daysTotal, 1);
      const blendedDaily = avgAvailable ? (w * curDaily + (1 - w) * histDaily) : curDaily;
      const projectedRemainingAvg = blendedDaily * cyc.daysRemaining;
      const projectedTotalSpend = spentSoFar + projectedRemainingAvg;
      const endAvg = balance - projectedRemainingAvg;

      return {
        balance, spentSoFar, totalBudget, plannedRemaining, endBudget,
        avgAvailable, avg3, blendedDaily, projectedRemainingAvg, projectedTotalSpend, endAvg,
        overBudget: projectedTotalSpend > totalBudget && totalBudget > 0,
        monthsUsed: last3.length, ...cyc
      };
    }

    function generateProjectionSeries() {
      const labels = [], sparkasse = [], portfolio = [], total = [];
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(2028, 9, 1); // October 2028 — end of Phase 3

      // Root in actual data
      let spVal = S.config.currentSparkasseBalance != null ? S.config.currentSparkasseBalance : 5800;
      let portVal = latestPortfolioValue();

      const TARGET = S.config.sparkasseTarget || 10000;
      const MONTHLY_R = Math.pow(1.07, 1 / 12) - 1; // 7% annual blended return
      const PHASE2_START = new Date(2026, 9, 1);  // 1 Oct 2026
      const PHASE3_START = new Date(2028, 0, 1);  // 1 Jan 2028

      let d = new Date(startDate);
      while (d <= endDate) {
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        labels.push(label);
        sparkasse.push(parseFloat(spVal.toFixed(2)));
        portfolio.push(parseFloat(portVal.toFixed(2)));
        total.push(parseFloat((spVal + portVal).toFixed(2)));

        if (d < PHASE2_START) {
          // Phase 1: save €1,000/mo to Sparkasse, no investing
          spVal = Math.min(spVal + 1000, TARGET);
        } else if (d < PHASE3_START) {
          // Phase 2: Sparkasse holds at €10k; €1,000/mo invested
          spVal = TARGET;
          portVal = portVal * (1 + MONTHLY_R) + 1000;
        } else {
          // Phase 3: Sparkasse holds at €10k; €1,500/mo invested
          spVal = TARGET;
          portVal = portVal * (1 + MONTHLY_R) + 1500;
        }
        d.setMonth(d.getMonth() + 1);
      }
      return { labels, sparkasse, portfolio, total };
    }

    function renderForecast() {
      const el = document.getElementById('momForecast'); if (!el) return;
      const f = forecastMonthEnd();
      if (!f) { el.innerHTML = '<div class="card" style="color:var(--muted);font-size:13px">Set your Sparkasse balance in Settings to see end-of-month forecasts.</div>'; return; }
      const sign = n => (n < 0 ? '−' : '') + fmtEur(n);
      const col = n => n < 0 ? 'var(--red)' : 'var(--green)';
      const trendCard = f.avgAvailable ? `
    <div class="card">
      <div class="card-title">📊 Likely end balance</div>
      <div class="card-value" style="color:${col(f.endAvg)}">${sign(f.endAvg)}</div>
      <div class="card-sub">Your recent pace blended with this month so far</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.7">
        Spent so far: <strong style="color:var(--text)">${fmtEur(f.spentSoFar)}</strong> (avg ${fmtEur(f.avg3)}/mo)<br>
        Projected spend left (${f.daysRemaining} day${f.daysRemaining === 1 ? '' : 's'}): ${fmtEur(f.projectedRemainingAvg)}<br>
        Projected month total: <strong style="color:${f.overBudget ? 'var(--red)' : 'var(--green)'}">${fmtEur(f.projectedTotalSpend)}</strong> vs ${fmtEur(f.totalBudget)} budget
      </div>
    </div>` : `
    <div class="card">
      <div class="card-title">📊 Likely end balance</div>
      <div class="card-value" style="color:var(--muted)">—</div>
      <div class="card-sub">Need at least 1 completed month of data</div>
    </div>`;
      const budgetCard = `
    <div class="card">
      <div class="card-title">📐 If you spend your full budget</div>
      <div class="card-value" style="color:${col(f.endBudget)}">${sign(f.endBudget)}</div>
      <div class="card-sub">Conservative floor — every remaining budgeted euro spent</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.7">
        Spent so far: <strong style="color:var(--text)">${fmtEur(f.spentSoFar)}</strong> of ${fmtEur(f.totalBudget)} budget<br>
        Budget left to spend: ${fmtEur(f.plannedRemaining)}
      </div>
    </div>`;
      el.className = 'g2';
      el.innerHTML = trendCard + budgetCard;
    }

    function renderProjections() {
      renderForecast();
      const series = generateProjectionSeries();
      const portDots = series.labels.map(label => { const e = S.portfolioEntries.find(p => p.date.slice(0, 7) === label); return e ? e.value : null; });
      const sparkDots = series.labels.map(label => { const h = S.balanceHistory.find(b => b.date === label); return h ? h.balance : null; });

      destroyChart('chartProjection');
      charts['chartProjection'] = new Chart(document.getElementById('chartProjection'), {
        type: 'line', data: {
          labels: series.labels, datasets: [
            { label: 'Total Wealth (proj)', data: series.total, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
            { label: 'Sparkasse (proj)', data: series.sparkasse, borderColor: '#10b981', tension: .4, pointRadius: 0 },
            { label: 'Portfolio (proj)', data: series.portfolio, borderColor: '#3b82f6', tension: .4, pointRadius: 0 },
            { label: 'Portfolio (actual)', data: portDots, borderColor: '#f59e0b', pointRadius: 5, showLine: false, borderWidth: 0, pointStyle: 'circle' },
          ]
        }, options: chartDefaults()
      });

      destroyChart('chartBalHistory');
      charts['chartBalHistory'] = new Chart(document.getElementById('chartBalHistory'), {
        type: 'line', data: {
          labels: series.labels, datasets: [
            { label: 'Plan (phase targets)', data: series.sparkasse, borderColor: '#6c63ff', borderDash: [4, 4], tension: .3, pointRadius: 0, borderWidth: 2 },
            { label: 'Actual', data: sparkDots, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.1)', fill: true, tension: .3, pointRadius: 5, spanGaps: false },
          ]
        }, options: chartDefaults()
      });

      const gi = l => series.labels.indexOf(l);
      const p1End = series.sparkasse[gi('2026-09')] ?? series.sparkasse[series.sparkasse.length - 1] ?? 0;
      const p2End = series.total[gi('2027-12')] ?? 0;
      const p3End = series.total[gi('2028-10')] ?? series.total[series.total.length - 1] ?? 0;
      document.getElementById('projCards').innerHTML = `
    <div class="card"><div class="card-title">Phase 1 end (Sep 2026)</div><div class="card-value">${fmtEur(p1End)}</div><div class="card-sub">Sparkasse → €10k safety net</div></div>
    <div class="card"><div class="card-title">Phase 2 end (Dec 2027)</div><div class="card-value">${fmtEur(p2End)}</div><div class="card-sub">€10k Sparkasse + ~€12.4k portfolio</div></div>
    <div class="card"><div class="card-title">Phase 3 end (Oct 2028)</div><div class="card-value">${fmtEur(p3End)}</div><div class="card-sub">Plan target: ~€41,762 total wealth</div></div>`;

      const today = new Date().toISOString().slice(0, 7), pIdx = series.labels.indexOf(today);
      const projSp = pIdx >= 0 ? series.sparkasse[pIdx] : null, actual = S.config.currentSparkasseBalance;
      const avpEl = document.getElementById('avpPanel');
      if (actual != null && projSp != null) {
        const delta = actual - projSp, onTrack = delta >= -500;
        avpEl.innerHTML = `<div style="margin-bottom:10px"><div style="font-size:12px;color:var(--muted);margin-bottom:3px">Projected for ${today}</div><div style="font-size:22px;font-weight:700">${fmtEur(projSp)}</div></div><div style="margin-bottom:10px"><div style="font-size:12px;color:var(--muted);margin-bottom:3px">Actual balance</div><div style="font-size:22px;font-weight:700;color:var(--green)">${fmtEur(actual)}</div></div><div style="padding:10px;border-radius:7px;background:${onTrack ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};border:1px solid ${onTrack ? 'var(--green)' : 'var(--red)'}"><div style="font-weight:600;color:${onTrack ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '+' : ''}${fmtEur(Math.abs(delta))} vs projection</div><div style="font-size:12px;margin-top:5px;color:${onTrack ? 'var(--green)' : 'var(--red)'}">${onTrack ? '✅ On track!' : '⚠️ More than €500 behind — review spending.'}</div></div>`;
      } else { avpEl.innerHTML = '<div style="color:var(--muted);font-size:13px">Set your Sparkasse balance in Settings to enable tracking.</div>'; }

      // Default halal portfolio plan (Scalable Capital) — edit to match your own strategy
      const assets = [
        { name: '🏦 Sparkasse (safety net)', p1: '€1,000/mo · cap €10k', p2: 'Hold at €10,000', p3: 'Hold at €10,000' },
        { name: '🕌 HSBC Islamic ETF (IE000X9FTI22)', p1: '—', p2: '€500/mo · 50%', p3: '€750/mo · 50%' },
        { name: '🟩 NVIDIA NVDA (fractional)', p1: '—', p2: '€150/mo · 15%', p3: '€225/mo · 15%' },
        { name: '🍎 Apple AAPL (fractional)', p1: '—', p2: '€100/mo · 10%', p3: '€150/mo · 10%' },
        { name: '🥇 Xetra-Gold (DE000A0S9GB0)', p1: '—', p2: '€150/mo · 15%', p3: '€225/mo · 15%' },
        { name: '💶 Scalable cash (Vorabpauschale)', p1: '—', p2: '€100/mo · 10%', p3: '€150/mo · 10%' },
        { name: '📊 TOTAL invested per month', p1: '€1,000 → Sparkasse', p2: '€1,000 → Scalable Capital', p3: '€1,500 → Scalable Capital' },
      ];
      document.querySelector('#investTable tbody').innerHTML = assets.map((a, i) => {
        const isTotal = i === assets.length - 1;
        return `<tr style="${isTotal ? 'border-top:2px solid var(--border)' : ''}"><td style="font-weight:${isTotal ? 700 : 500}">${a.name}</td><td style="color:var(--muted)">${a.p1}</td><td style="color:var(--muted)">${a.p2}</td><td style="color:var(--muted)">${a.p3}</td></tr>`;
      }).join('');
    }

