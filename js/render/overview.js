    // ================================================================
    // OVERVIEW
    // ================================================================
    function latestPortfolioValue() { return S.portfolioEntries.length ? S.portfolioEntries[S.portfolioEntries.length - 1].value : 0; }

    function renderOverview() {
      const spark = S.config.currentSparkasseBalance, port = latestPortfolioValue(), net = (spark || 0) + port, target = S.config.sparkasseTarget || 10000;
      document.getElementById('ov-sparkasse').textContent = spark != null ? fmtEur(spark) : '—';
      document.getElementById('ov-portfolio').textContent = fmtEur(port);
      document.getElementById('ov-networth').textContent = fmtEurSigned(net);
      if (spark != null) { const pct = Math.round((spark / target) * 100); document.getElementById('ov-spark-sub').textContent = `${pct}% of €${target.toLocaleString('de-DE')} target`; document.getElementById('celebBanner').style.display = pct >= 90 ? 'block' : 'none'; }
      const flags = computeRiskFlags(), score = computeHealthScore(flags);
      const el = document.getElementById('ov-health'); el.textContent = score; el.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';
      document.getElementById('ovBanner').style.display = S.transactions.length === 0 ? 'flex' : 'none';
      drawSparkline(); renderOvSpend(); renderOvCat(); renderOvWealth();
    }

    function drawSparkline() {
      const cv = document.getElementById('sparklineCanvas'), { ctx, w, h } = hidpiCtx(cv), history = S.balanceHistory.slice(-12);
      if (history.length < 2) { ctx.clearRect(0, 0, w, h); return; }
      const vals = history.map(h => h.balance), mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1;
      const p = 3;
      ctx.clearRect(0, 0, w, h); ctx.beginPath(); ctx.strokeStyle = '#6c63ff'; ctx.lineWidth = 2;
      vals.forEach((v, i) => { const x = p + (i / (vals.length - 1)) * (w - p * 2), y = h - p - ((v - mn) / range) * (h - p * 2); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke();
    }

    function renderOvSpend() {
      const snaps = monthlySnapshots.slice(-6); destroyChart('chartOvSpend'); if (!snaps.length) return;
      charts['chartOvSpend'] = new Chart(document.getElementById('chartOvSpend'), { type: 'bar', data: { labels: snaps.map(s => s.month), datasets: [{ label: 'Spending', data: snaps.map(s => s.totalSpending.toFixed(2)), backgroundColor: 'rgba(239,68,68,.7)' }, { label: 'Income', data: snaps.map(s => s.totalIncome.toFixed(2)), backgroundColor: 'rgba(16,185,129,.7)' }] }, options: chartDefaults() });
    }

    function renderOvCat() {
      const latest = monthlySnapshots[monthlySnapshots.length - 1]; destroyChart('chartOvCat'); if (!latest) return;
      const cats = Object.entries(latest.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
      charts['chartOvCat'] = new Chart(document.getElementById('chartOvCat'), { type: 'doughnut', data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1].toFixed(2)), backgroundColor: PIE_COLORS }] }, options: { ...chartDefaults(), plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', font: { size: 11 } } } } } });
    }

    function renderOvWealth() {
      const series = generateProjectionSeries(); destroyChart('chartOvWealth');
      charts['chartOvWealth'] = new Chart(document.getElementById('chartOvWealth'), { type: 'line', data: { labels: series.labels, datasets: [{ label: 'Total Wealth', data: series.total, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,.08)', fill: true, tension: .4, pointRadius: 0 }, { label: 'Sparkasse', data: series.sparkasse, borderColor: '#10b981', tension: .4, pointRadius: 0 }, { label: 'Portfolio', data: series.portfolio, borderColor: '#3b82f6', tension: .4, pointRadius: 0 }] }, options: chartDefaults() });
    }

