    // ================================================================
    // HELPERS
    // ================================================================
    function fmtEur(n) { return '€' + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
    function showToast(msg, dur = 3500) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur); }
    function showLoading(msg = 'Processing…') { document.getElementById('loadingMsg').textContent = msg; document.getElementById('loadingOverlay').classList.add('show'); }
    function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    // Read a CSS custom property off :root so charts follow the active theme.
    function cssVar(name, fallback) { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
    function chartDefaults() {
      const muted = cssVar('--muted', '#8892b0'), text = cssVar('--text', '#e2e8f0'), surface = cssVar('--surface', '#1a1d27'), border = cssVar('--border', '#2e3250'), grid = cssVar('--chart-grid', 'rgba(255,255,255,.04)');
      return { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: muted, font: { size: 11 } } }, tooltip: { backgroundColor: surface, titleColor: text, bodyColor: muted, borderColor: border, borderWidth: 1 } }, scales: { x: { grid: { color: grid }, ticks: { color: muted, maxRotation: 45 } }, y: { grid: { color: grid }, ticks: { color: muted, callback: v => `€${v}` } } } };
    }
    const PIE_COLORS = ['#6c63ff', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#94a3b8'];
    function rebuildAll() {
      if (activeTab === 'overview') renderOverview();
      if (activeTab === 'transactions') renderTx();
      if (activeTab === 'spending') renderSpending();
      if (activeTab === 'portfolio') renderPortfolio();
      if (activeTab === 'projections') renderProjections();
      if (activeTab === 'risk') renderRisk();
      if (activeTab === 'upload') renderUploadTab();
    }

