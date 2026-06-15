    // ================================================================
    // PORTFOLIO
    // ================================================================
    function openPortfolioModal() {
      document.getElementById('port-date-input').value = new Date().toISOString().slice(0, 10);
      document.getElementById('port-value-input').value = '';
      document.getElementById('port-notes-input').value = '';
      document.getElementById('portfolioModal').classList.add('open');
    }

    async function savePortfolioEntry() {
      const date = document.getElementById('port-date-input').value;
      const value = parseFloat(document.getElementById('port-value-input').value);
      const notes = document.getElementById('port-notes-input').value.trim();
      if (!date || isNaN(value) || value < 0) { showToast('⚠️ Enter valid date and value'); return; }
      const entry = { id: `port-${date}-${Math.random().toString(36).slice(2, 6)}`, date, value, notes };
      S.portfolioEntries.push(entry); S.portfolioEntries.sort((a, b) => a.date.localeCompare(b.date));
      await dbPut('portfolioEntries', entry);
      closeModal('portfolioModal'); showToast('✅ Portfolio entry saved');
      renderPortfolio(); rebuildAll();
    }

    async function deletePortfolioEntry(id) {
      S.portfolioEntries = S.portfolioEntries.filter(e => e.id !== id);
      await dbDelete('portfolioEntries', id); renderPortfolio(); rebuildAll();
    }

    function renderPortfolio() {
      const entries = S.portfolioEntries;
      document.getElementById('portEntryCount').textContent = `${entries.length} entries`;
      if (!entries.length) {
        document.getElementById('portEmpty').style.display = 'block';
        document.getElementById('portCards').style.display = 'none';
        document.getElementById('portChartBox').style.display = 'none';
        document.getElementById('portTableBox').style.display = 'none';
        return;
      }
      document.getElementById('portEmpty').style.display = 'none';
      document.getElementById('portCards').style.display = 'grid';
      document.getElementById('portChartBox').style.display = 'block';
      document.getElementById('portTableBox').style.display = 'block';

      const latest = entries[entries.length - 1];
      let totalContrib = entries[0].value;
      for (let i = 1; i < entries.length; i++) { const diff = entries[i].value - entries[i - 1].value; if (diff > 0) totalContrib += diff; }
      const ret = latest.value - totalContrib, retPct = totalContrib > 0 ? (ret / totalContrib * 100).toFixed(1) : 0;

      document.getElementById('port-current').textContent = fmtEur(latest.value);
      document.getElementById('port-asof').textContent = `As of ${latest.date}`;
      document.getElementById('port-invested').textContent = fmtEur(totalContrib);
      document.getElementById('port-return').textContent = `${ret >= 0 ? '+' : '−'}${fmtEur(Math.abs(ret))}`;
      document.getElementById('port-return').style.color = ret >= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('port-return-sub').textContent = `${retPct}% return`;

      destroyChart('chartPortHistory');
      charts['chartPortHistory'] = new Chart(document.getElementById('chartPortHistory'), { type: 'line', data: { labels: entries.map(e => e.date), datasets: [{ label: 'Portfolio Value', data: entries.map(e => e.value), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', fill: true, tension: .3 }] }, options: chartDefaults() });

      const sorted = [...entries].reverse();
      document.getElementById('portBody').innerHTML = sorted.map((e, i) => {
        const prev = sorted[i + 1], change = prev ? e.value - prev.value : null;
        return `<tr><td>${e.date}</td><td style="font-weight:600">${fmtEur(e.value)}</td><td style="color:${change === null ? 'var(--muted)' : change >= 0 ? 'var(--green)' : 'var(--red)'}">${change === null ? '—' : (change >= 0 ? '+' : '−') + fmtEur(Math.abs(change))}</td><td style="color:var(--muted);font-size:12px">${esc(e.notes || '—')}</td><td><button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3)" onclick="deletePortfolioEntry('${e.id}')">✕</button></td></tr>`;
      }).join('');
    }

