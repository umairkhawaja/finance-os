    // ================================================================
    // TRANSACTIONS
    // ================================================================
    function renderTx() {
      const search = document.getElementById('txSearch').value.toLowerCase(), cat = document.getElementById('txCat').value, month = document.getElementById('txMonth').value, type = document.getElementById('txType').value;
      let txs = S.transactions.filter(t => {
        if (search && !t.description.toLowerCase().includes(search)) return false;
        if (cat && t.category !== cat) return false;
        if (month && !t.date.startsWith(month)) return false;
        if (type === 'expense' && t.amount >= 0) return false;
        if (type === 'income' && t.amount < 0) return false;
        return true;
      });
      document.getElementById('txCount').textContent = `(${txs.length} of ${S.transactions.length})`;
      const body = document.getElementById('txBody');
      if (!txs.length) { body.innerHTML = ''; document.getElementById('txEmpty').style.display = S.transactions.length === 0 ? 'block' : 'none'; return; }
      document.getElementById('txEmpty').style.display = 'none';
      const CAT_COLORS = { rent: '#818cf8', food: '#f97316', transport: '#06b6d4', shopping: '#ec4899', subscriptions: '#8b5cf6', remittance: '#f43f5e', insurance: '#14b8a6', installments: '#a855f7', health: '#10b981', income: '#22c55e', investment: '#3b82f6', entertainment: '#f59e0b', transfer: '#64748b', other: '#94a3b8' };
      body.innerHTML = txs.map(t => `
    <tr>
      <td style="white-space:nowrap">${t.date}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.description)}">${esc(t.description)}</td>
      <td style="color:var(--muted);font-size:12px">${t.type}</td>
      <td><span style="color:${CAT_COLORS[t.category] || 'var(--muted)'}">${t.category}</span></td>
      <td style="text-align:right;font-weight:600;color:${t.amount >= 0 ? 'var(--green)' : 'var(--red)'}">${t.amount >= 0 ? '+' : '-'}${fmtEur(t.amount)}</td>
      <td><select style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:5px;font-size:11px" onchange="reclassTx('${t.id}',this.value)">
        ${categoryOptions(t.category)}
      </select></td>
    </tr>`).join('');
    }

    async function reclassTx(id, newCat) { const tx = S.transactions.find(t => t.id === id); if (tx) { tx.category = newCat; tx.manual = true; await dbPut('transactions', tx); rebuildSnapshots(); } }

    // Re-run autoCategory (incl. user rules) over every transaction. Skips rows the
    // user manually reclassified (tx.manual). Persists only changed rows.
    async function reapplyAllCategories() {
      let changed = 0;
      for (const tx of S.transactions) {
        if (tx.manual) continue;
        const next = autoCategory(tx.rawDesc || tx.description, tx.type, tx.amount);
        if (next && next !== tx.category) { tx.category = next; await dbPut('transactions', tx); changed++; }
      }
      rebuildSnapshots();
      if (activeTab === 'transactions') renderTx();
      if (activeTab === 'spending') renderSpending();
      showToast(`✅ Re-categorized ${changed} transaction${changed === 1 ? '' : 's'}`);
    }

    function openReclassify() {
      const others = S.transactions.filter(t => t.category === 'other' && Math.abs(t.amount) > 200);
      if (!others.length) { showToast('No "other" transactions >€200'); return; }
      document.getElementById('reclassifyBody').innerHTML = others.map(t => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${t.date} — ${esc(t.description.slice(0, 40))}</span>
      <span style="font-weight:600;color:var(--red);white-space:nowrap">${fmtEur(t.amount)}</span>
      <select data-id="${t.id}" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 7px;border-radius:5px;font-size:12px">
        ${categoryOptions('other')}
      </select>
    </div>`).join('');
      document.getElementById('reclassifyModal').classList.add('open');
    }

    async function applyReclassify() {
      for (const sel of document.querySelectorAll('#reclassifyBody select[data-id]')) { const tx = S.transactions.find(t => t.id === sel.dataset.id); if (tx) { tx.category = sel.value; tx.manual = true; await dbPut('transactions', tx); } }
      rebuildSnapshots(); closeModal('reclassifyModal'); showToast('✅ Categories updated'); if (activeTab === 'transactions') renderTx();
    }

    // RFC-4180 field quoting + spreadsheet formula-injection guard. A field that
    // starts with = + - @ (or a tab/CR) is prefixed with a single quote so apps like
    // Excel/Sheets treat it as text instead of executing it as a formula.
    function csvCell(v) {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    function exportCSV() {
      const rows = [['Date', 'Description', 'Type', 'Category', 'Amount']];
      S.transactions.forEach(t => rows.push([t.date, t.description, t.type, t.category, t.amount]));
      const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'transactions.csv'; a.click();
    }

