    // ================================================================
    // SNAPSHOTS
    // ================================================================
    function rebuildSnapshots() {
      const byMonth = {};
      S.transactions.forEach(tx => { const m = tx.date.slice(0, 7); if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(tx); });
      monthlySnapshots = Object.keys(byMonth).sort().map(month => {
        // 'transfer' rows (e.g. cash deposits) move money but aren't income or
        // spending, so they're excluded from both totals and the savings rate.
        const txs = byMonth[month].filter(t => t.category !== 'transfer');
        const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const spending = Math.abs(txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
        const byCategory = {};
        txs.filter(t => t.amount < 0).forEach(tx => { byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount); });
        // Savings rate is allowed to go negative: a month where you spent more than
        // you earned should read as a negative rate, not be silently clamped to 0%
        // (which hid dissaving and inflated the rolling average).
        return { month, totalSpending: spending, totalIncome: income, savingsRate: income > 0 ? (income - spending) / income : 0, byCategory, txCount: txs.length };
      });
      const opts = monthlySnapshots.map(s => `<option value="${s.month}">${s.month}</option>`).reverse().join('');
      document.getElementById('txMonth').innerHTML = '<option value="">All Months</option>' + opts;
      document.getElementById('spendMonth').innerHTML = monthlySnapshots.map(s => `<option value="${s.month}">${s.month}</option>`).reverse().join('');
    }

    // Composite key for duplicate detection. Includes `type` so e.g. a card refund
    // and a card payment of the same amount on the same day don't collide.
    function txKey(t) { return `${t.date}|${t.amount}|${t.type}|${(t.description || '').slice(0, 20)}`; }

    // Multiset-based merge: a key that legitimately repeats within a statement (two
    // identical coffees the same day) is preserved, while re-uploading the *same*
    // statement adds nothing. We freeze the existing per-key counts, then for each
    // incoming tx only skip it while it still matches an already-stored occurrence.
    async function mergeTransactions(newTxs) {
      const existingCount = {};
      for (const t of S.transactions) { const k = txKey(t); existingCount[k] = (existingCount[k] || 0) + 1; }
      const consumed = {};
      let added = 0;
      for (const tx of newTxs) {
        const k = txKey(tx);
        consumed[k] = (consumed[k] || 0) + 1;
        if (consumed[k] <= (existingCount[k] || 0)) continue; // matches an existing row → dup
        S.transactions.push(tx); await dbPut('transactions', tx); added++;
      }
      S.transactions.sort((a, b) => b.date.localeCompare(a.date));
      S.loggedMonths = new Set(S.transactions.map(t => t.date.slice(0, 7)));
      rebuildSnapshots();
      return added;
    }

