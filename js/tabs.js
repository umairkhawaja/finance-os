    // ================================================================
    // TABS
    // ================================================================
    const OVERFLOW_TABS = ['portfolio', 'risk', 'upload', 'settings'];
    function openMoreSheet() { document.getElementById('moreSheet').classList.add('open'); }
    function closeMoreSheet() { document.getElementById('moreSheet').classList.remove('open'); }

    function showTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('nav button, .more-sheet-panel button').forEach(b => b.classList.remove('active'));
      const tab = document.getElementById('tab-' + name); if (!tab) return;
      tab.classList.add('active');
      // Top nav (desktop) matches by onclick string
      document.querySelectorAll('nav#nav button').forEach(b => { const on = b.getAttribute('onclick')?.includes(`'${name}'`); b.classList.toggle('active', !!on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      // Bottom tab bar + More sheet match by data-tab attribute
      document.querySelectorAll('[data-tab="' + name + '"]').forEach(b => b.classList.add('active'));
      // Highlight "More" when an overflow tab is active
      const moreBtn = document.getElementById('moreTabBtn');
      if (moreBtn) moreBtn.classList.toggle('active', OVERFLOW_TABS.includes(name));
      activeTab = name;
      if (name === 'overview') renderOverview();
      if (name === 'transactions') renderTx();
      if (name === 'spending') renderSpending();
      if (name === 'portfolio') renderPortfolio();
      if (name === 'projections') renderProjections();
      if (name === 'risk') renderRisk();
      if (name === 'upload') renderUploadTab();
      if (name === 'settings') { loadConfigUI(); buildBudgetFields(); renderStorageInfo(); if (window.updateSyncUI) updateSyncUI(); if (window.updatePinUI) updatePinUI(); }
    }

