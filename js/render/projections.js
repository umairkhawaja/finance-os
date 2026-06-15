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
    function cycleStartDay() { return Math.min(Math.max(parseInt(S.config.cycleStartDay) || 1, 1), 28); }
    const _MS_DAY = 86400000;
    const _isoDate = d => d.toISOString().slice(0, 10);

    // Returns the current spend cycle window [start, end) honoring cycleStartDay.
    function currentCycle() {
      const now = new Date();
      const startDay = cycleStartDay();
      let start = new Date(now.getFullYear(), now.getMonth(), startDay);
      if (now < start) start = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay); // exclusive
      const daysTotal = Math.round((end - start) / _MS_DAY);
      const daysElapsed = Math.min(daysTotal, Math.max(1, Math.floor((now - start) / _MS_DAY) + 1));
      const daysRemaining = Math.max(0, daysTotal - daysElapsed);
      return { start, end, daysTotal, daysElapsed, daysRemaining };
    }

    // Average daily spend across the last `n` COMPLETED cycles before `beforeStart`,
    // measured on the same cycleStartDay windows as the current cycle (so the trend
    // baseline and this cycle's live pace are apples-to-apples even when the cycle
    // doesn't start on the 1st). Empty cycles (no transactions at all) are skipped so
    // a gap in data never deflates the average. Returns { dailies:[], months }.
    function completedCycleDailies(n, beforeStart) {
      const startDay = cycleStartDay();
      const dailies = [];
      let end = beforeStart; // exclusive end of the cycle immediately before the current one
      for (let i = 0; i < n + 6 && dailies.length < n; i++) { // look back a bit further to skip empties
        const start = new Date(end.getFullYear(), end.getMonth() - 1, startDay);
        const sISO = _isoDate(start), eISO = _isoDate(end);
        const inWin = S.transactions.filter(t => t.date >= sISO && t.date < eISO);
        if (inWin.length) {
          const spend = Math.abs(inWin.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
          const days = Math.max(1, Math.round((end - start) / _MS_DAY));
          dailies.push(spend / days);
        }
        end = start;
      }
      return dailies;
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
      // History is measured over the last 3 *completed cycles* using the same
      // cycleStartDay windows as the live cycle, so the baseline and the current pace
      // are computed on identical footing (previously history was calendar-month based
      // while spentSoFar was cycle based — inconsistent whenever cycleStartDay ≠ 1).
      const dailies = completedCycleDailies(3, cyc.start);
      const avgAvailable = dailies.length > 0;
      const histDaily = avgAvailable ? dailies.reduce((s, d) => s + d, 0) / dailies.length : 0; // historical €/day
      const avg3 = histDaily * cyc.daysTotal; // implied average spend per cycle, for display
      const last3 = dailies; // kept for monthsUsed below
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

    const _monthLabel = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    function activePlan() {
      const p = (S.config && S.config.plan) || DEFAULT_PLAN;
      const phases = (Array.isArray(p.phases) ? [...p.phases] : []).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      return { annualReturnPct: p.annualReturnPct != null ? p.annualReturnPct : 7, end: p.end || '2028-10', phases };
    }

    // Cache the (pure-ish) projection series. It only depends on the anchor balance,
    // portfolio anchor, target and the plan, so we memoize on a signature of those to
    // avoid recomputing it 3-4× on every render (overview, risk, projections charts).
    let _projCache = { sig: null, val: null };
    function generateProjectionSeries() {
      const plan = activePlan();
      const firstHist = S.balanceHistory[0];
      const portAnchor = latestPortfolioValue();
      const spAnchor = firstHist ? firstHist.balance
        : (S.config.currentSparkasseBalance != null ? S.config.currentSparkasseBalance : 5800);
      const target = S.config.sparkasseTarget || 10000;
      const now = new Date();
      const nowMonth = _monthLabel(now);

      // Seed for the FORWARD-looking projection: the realistic end-of-current-month
      // Sparkasse balance — the same figure the End-of-Month Forecast cards show — so
      // the current month reconciles with them. Falls back to the current balance,
      // then the plan anchor when no forecast is available.
      const fc = forecastMonthEnd();
      const fwdSeed = fc ? fc.endAvg
        : (S.config.currentSparkasseBalance != null ? S.config.currentSparkasseBalance : spAnchor);

      // The forward series depends on today and the forecast seed too, so fold both
      // into the cache signature (alongside the past-anchored inputs).
      const sig = JSON.stringify([firstHist ? firstHist.date : null, spAnchor, portAnchor, target, plan, nowMonth, parseFloat(fwdSeed.toFixed(2))]);
      if (_projCache.sig === sig) return _projCache.val;

      const labels = [], sparkasse = [], portfolio = [], total = [];

      // Anchor the plan at a FIXED origin — the earliest tracked Sparkasse balance —
      // and roll it forward from there. Anchoring in the past lets the plan diverge
      // from reality, which is the whole point of the "actual vs projected" compare.
      const anchorMonth = firstHist ? firstHist.date : nowMonth;
      const [ay, am] = anchorMonth.split('-').map(Number);
      const startDate = new Date(ay, am - 1, 1);
      const [ey, em] = plan.end.split('-').map(Number);
      const endDate = new Date(ey, em - 1, 1);

      let spVal = spAnchor, portVal = portAnchor;
      const monthlyR = Math.pow(1 + plan.annualReturnPct / 100, 1 / 12) - 1;
      // Resolve which phase a given month label falls in (last phase whose start ≤ label).
      const phaseFor = label => { let cur = null; for (const ph of plan.phases) { if ((ph.start || '') <= label) cur = ph; } return cur; };

      let d = new Date(startDate);
      while (d <= endDate) {
        const label = _monthLabel(d);
        // Apply this month's plan contribution/growth BEFORE recording the point so
        // each value is the projected END-of-month balance. Previously the point was
        // pushed first and the contribution applied after, so every figure — incl.
        // the current month, the phase-end cards and the actual-vs-projected compare —
        // showed the start-of-month value and was a full month behind.
        const ph = phaseFor(label);
        if (ph) {
          spVal = Math.min(spVal + (ph.sparkasseMonthly || 0), target);
          portVal = portVal * (1 + monthlyR) + (ph.invest || 0);
        }
        labels.push(label);
        sparkasse.push(parseFloat(spVal.toFixed(2)));
        portfolio.push(parseFloat(portVal.toFixed(2)));
        total.push(parseFloat((spVal + portVal).toFixed(2)));
        d.setMonth(d.getMonth() + 1);
      }

      // --- Forward-looking projection ----------------------------------------
      // Start from TODAY's reality (forecast seed for Sparkasse, current value for
      // the portfolio) and roll the plan forward, so the realistic "where am I
      // headed" view reconciles with the forecast. Months before today are null so
      // the line starts at the current month. The past-anchored series above is left
      // untouched for the Actual-vs-Projected comparison (dashed plan line, avpPanel,
      // risk flag). If today is outside the plan horizon, mirror the past series.
      const fwdSparkasse = [], fwdPortfolio = [], fwdTotal = [];
      const todayIdx = labels.indexOf(nowMonth);
      let fSp = fwdSeed, fPort = portAnchor;
      for (let k = 0; k < labels.length; k++) {
        if (todayIdx < 0) { fwdSparkasse.push(sparkasse[k]); fwdPortfolio.push(portfolio[k]); fwdTotal.push(total[k]); continue; }
        if (k < todayIdx) { fwdSparkasse.push(null); fwdPortfolio.push(null); fwdTotal.push(null); continue; }
        if (k > todayIdx) { // the current-month point IS the seed (end-of-month reality)
          const ph = phaseFor(labels[k]);
          if (ph) {
            fSp = Math.min(fSp + (ph.sparkasseMonthly || 0), target);
            fPort = fPort * (1 + monthlyR) + (ph.invest || 0);
          }
        }
        fwdSparkasse.push(parseFloat(fSp.toFixed(2)));
        fwdPortfolio.push(parseFloat(fPort.toFixed(2)));
        fwdTotal.push(parseFloat((fSp + fPort).toFixed(2)));
      }

      // anchorBalance is the raw starting balance (start of the anchor month), not the
      // first plotted point — that now already includes the anchor month's contribution.
      const val = { labels, sparkasse, portfolio, total, fwdSparkasse, fwdPortfolio, fwdTotal, fwdMonth: nowMonth, anchorMonth, anchorBalance: spAnchor, plan };
      _projCache = { sig, val };
      return val;
    }
    function invalidateProjCache() { _projCache = { sig: null, val: null }; }

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

      // Forward-looking projection lines start from today's reality (fwd* series),
      // so they line up with the End-of-Month Forecast; historical actual portfolio
      // dots still provide the past context.
      destroyChart('chartProjection');
      charts['chartProjection'] = new Chart(document.getElementById('chartProjection'), {
        type: 'line', data: {
          labels: series.labels, datasets: [
            { label: 'Total Wealth (proj)', data: series.fwdTotal, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2, spanGaps: false },
            { label: 'Sparkasse (proj)', data: series.fwdSparkasse, borderColor: '#10b981', tension: .4, pointRadius: 0, spanGaps: false },
            { label: 'Portfolio (proj)', data: series.fwdPortfolio, borderColor: '#3b82f6', tension: .4, pointRadius: 0, spanGaps: false },
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

      // Build a card per phase, showing projected total wealth at the end of each
      // phase (the month before the next phase starts, or the plan horizon for the
      // last phase). Fully derived from the configured plan.
      const phases = series.plan.phases;
      const valueAtOrBefore = label => { let idx = -1; for (let k = 0; k < series.labels.length; k++) { if (series.labels[k] <= label) idx = k; } return idx; };
      const prevMonth = label => { const [y, m] = label.split('-').map(Number); const d = new Date(y, m - 2, 1); return _monthLabel(d); };
      document.getElementById('projCards').innerHTML = phases.map((ph, i) => {
        const endLabel = i < phases.length - 1 ? prevMonth(phases[i + 1].start) : series.plan.end;
        const idx = valueAtOrBefore(endLabel);
        // Prefer the forward-looking value (anchored to today's reality); fall back to
        // the past-anchored value for phases that have already ended.
        const val = idx >= 0 ? (series.fwdTotal[idx] != null ? series.fwdTotal[idx] : series.total[idx]) : 0;
        const moves = [ph.sparkasseMonthly ? `€${ph.sparkasseMonthly}/mo → Sparkasse` : '', ph.invest ? `€${ph.invest}/mo → invest` : ''].filter(Boolean).join(' · ') || 'Hold';
        return `<div class="card"><div class="card-title">${esc(ph.name || ('Phase ' + (i + 1)))} (end ${endLabel})</div><div class="card-value">${fmtEur(val)}</div><div class="card-sub">${esc(moves)}</div></div>`;
      }).join('');

      const today = new Date().toISOString().slice(0, 7), pIdx = series.labels.indexOf(today);
      const projSp = pIdx >= 0 ? series.sparkasse[pIdx] : null, actual = S.config.currentSparkasseBalance;
      const avpEl = document.getElementById('avpPanel');
      if (actual != null && projSp != null) {
        const delta = actual - projSp, onTrack = delta >= -500;
        // Plan only has predictive value once time has elapsed since the anchor month.
        const noElapsed = series.anchorMonth >= today;
        const baseline = `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Plan anchored to ${fmtEur(series.anchorBalance)} tracked in ${series.anchorMonth}</div>`;
        const verdict = noElapsed
          ? `<div style="padding:10px;border-radius:7px;background:rgba(148,163,184,.12);border:1px solid var(--border)"><div style="font-size:12px;color:var(--muted)">⏳ Plan starts this month — check back next month to see if you're on track.</div></div>`
          : `<div style="padding:10px;border-radius:7px;background:${onTrack ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};border:1px solid ${onTrack ? 'var(--green)' : 'var(--red)'}"><div style="font-weight:600;color:${onTrack ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '+' : ''}${fmtEur(Math.abs(delta))} vs projection</div><div style="font-size:12px;margin-top:5px;color:${onTrack ? 'var(--green)' : 'var(--red)'}">${onTrack ? '✅ On track!' : '⚠️ More than €500 behind — review spending.'}</div></div>`;
        avpEl.innerHTML = baseline + `<div style="margin-bottom:10px"><div style="font-size:12px;color:var(--muted);margin-bottom:3px">Projected for ${today}</div><div style="font-size:22px;font-weight:700">${fmtEur(projSp)}</div></div><div style="margin-bottom:10px"><div style="font-size:12px;color:var(--muted);margin-bottom:3px">Actual balance</div><div style="font-size:22px;font-weight:700;color:var(--green)">${fmtEur(actual)}</div></div>` + verdict;
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

