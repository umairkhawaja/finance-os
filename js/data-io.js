    // ================================================================
    // EXPORT / IMPORT
    // ================================================================
    function exportSnapshot() {
      const snap = { transactions: S.transactions, portfolioEntries: S.portfolioEntries, balanceHistory: S.balanceHistory, config: S.config, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `financeOS_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      showToast('💾 Snapshot exported');
    }
    function importSnapshot() { document.getElementById('importInput').click(); }
    async function doImport(file) {
      if (!file) return; showLoading('Importing…');
      try {
        const text = await readFileText(file), snap = JSON.parse(text);
        if (snap.transactions) { await dbClear('transactions'); for (const t of snap.transactions) await dbPut('transactions', t); }
        if (snap.portfolioEntries) { await dbClear('portfolioEntries'); for (const e of snap.portfolioEntries) await dbPut('portfolioEntries', e); }
        if (snap.balanceHistory) { await dbClear('balanceHistory'); for (const h of snap.balanceHistory) await dbPut('balanceHistory', h); }
        if (snap.config) await dbSetConfig('main', snap.config);
        await loadAll(); rebuildSnapshots(); loadConfigUI(); buildBudgetFields();
        hideLoading(); showToast(`✅ Imported ${snap.transactions?.length || 0} transactions`); rebuildAll();
      } catch (e) { hideLoading(); showToast(`❌ Import failed: ${e.message}`); }
    }
    async function clearAllData() {
      if (!confirm('⚠️ Delete ALL data?\n\nA backup snapshot will be downloaded first so you can re-import it if this was a mistake.')) return;
      // Safety net: auto-download a full snapshot before wiping, giving an undo path
      // (re-import the file) for an otherwise irreversible action.
      try { if (S.transactions.length || S.portfolioEntries.length || S.balanceHistory.length) exportSnapshot(); } catch (e) { }
      await dbClear('transactions'); await dbClear('portfolioEntries'); await dbClear('balanceHistory');
      S.transactions = []; S.portfolioEntries = []; S.balanceHistory = []; S.loggedMonths = new Set();
      rebuildSnapshots(); rebuildAll(); showToast('🗑️ All data cleared');
    }
    async function renderStorageInfo() {
      const el = document.getElementById('storageInfo');
      el.innerHTML = `Transactions: ${S.transactions.length}<br>Portfolio entries: ${S.portfolioEntries.length}<br>Months logged: ${S.loggedMonths.size}<br>Storage: IndexedDB (persists across sessions)`;
      try { if (navigator.storage?.estimate) { const est = await navigator.storage.estimate(); el.innerHTML += `<br>Used: ~${(est.usage / 1024 / 1024).toFixed(2)} MB`; } } catch (e) { }
    }

