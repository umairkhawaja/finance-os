    // ================================================================
    // SNAPSHOTS
    // ================================================================
    function rebuildSnapshots() {
      const byMonth = {};
      S.transactions.forEach(tx => { const m = tx.date.slice(0, 7); if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(tx); });
      monthlySnapshots = Object.keys(byMonth).sort().map(month => {
        const txs = byMonth[month];
        const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const spending = Math.abs(txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
        const byCategory = {};
        txs.filter(t => t.amount < 0).forEach(tx => { byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount); });
        return { month, totalSpending: spending, totalIncome: income, savingsRate: income > 0 ? Math.max(0, (income - spending) / income) : 0, byCategory, txCount: txs.length };
      });
      const opts = monthlySnapshots.map(s => `<option value="${s.month}">${s.month}</option>`).reverse().join('');
      document.getElementById('txMonth').innerHTML = '<option value="">All Months</option>' + opts;
      document.getElementById('spendMonth').innerHTML = monthlySnapshots.map(s => `<option value="${s.month}">${s.month}</option>`).reverse().join('');
    }

    async function mergeTransactions(newTxs) {
      const keys = new Set(S.transactions.map(t => `${t.date}|${t.amount}|${t.description.slice(0, 20)}`));
      let added = 0;
      for (const tx of newTxs) {
        const k = `${tx.date}|${tx.amount}|${tx.description.slice(0, 20)}`;
        if (!keys.has(k)) { S.transactions.push(tx); keys.add(k); await dbPut('transactions', tx); added++; }
      }
      S.transactions.sort((a, b) => b.date.localeCompare(a.date));
      S.loggedMonths = new Set(S.transactions.map(t => t.date.slice(0, 7)));
      rebuildSnapshots();
      return added;
    }

