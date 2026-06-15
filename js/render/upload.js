    // ================================================================
    // UPLOAD TAB
    // ================================================================
    function renderUploadTab() {
      document.getElementById('uploadCount').textContent = `${S.loggedMonths.size} months in database`;
      renderMonthGrid();
    }

    function renderMonthGrid() {
      const months = [], now = new Date();
      for (let i = 17; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
      document.getElementById('monthGrid').innerHTML = months.map(m => `<div class="month-chip ${S.loggedMonths.has(m) ? 'logged' : 'missing'}">${m}<br><span style="font-size:10px;opacity:.7">${S.loggedMonths.has(m) ? '✓ done' : 'missing'}</span></div>`).join('');
    }

    function handleDragOver(e) { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag'); }
    function handleDrop(e) { e.preventDefault(); document.getElementById('uploadZone').classList.remove('drag'); handleFiles(e.dataTransfer.files); }

    // Extract closing balance from Sparkasse PDF text.
    // Every statement has a line like: "Kontostand am 31.01.2026  5.432,10"
    function extractBalanceFromText(text) {
      let lastBalance = null, lastDate = null;
      for (const line of text.split('\n')) {
        // Match: Kontostand am DD.MM.YYYY [optional text] AMOUNT
        const m = line.match(/Kontostand am\s+(\d{2}\.\d{2}\.\d{4})[\s\S]*?(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i);
        if (m) {
          const [dd, mm, yyyy] = m[1].split('.');
          const date = `${yyyy}-${mm}-${dd}`;
          const amount = parseAmt(m[2]);
          if (!lastDate || date > lastDate) { lastDate = date; lastBalance = amount; }
        }
      }
      return { balance: lastBalance, date: lastDate };
    }

    async function handleFiles(files) {
      if (!files?.length) return;
      const arr = Array.from(files), prog = document.getElementById('uploadProgress'), log = document.getElementById('parseLog');
      prog.style.display = 'block'; log.style.display = 'block'; log.textContent = '';
      let totalAdded = 0;
      let latestBalanceDate = null, latestBalance = null;

      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        prog.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:7px;border:1px solid var(--border)"><div class="spinner"></div><span>Processing ${file.name} (${i + 1}/${arr.length})…</span></div>`;
        try {
          const text = await readFileText(file);
          const txs = parsePDFText(text);
          const months = [...new Set(txs.map(t => t.date.slice(0, 7)))];
          const already = months.filter(m => S.loggedMonths.has(m));
          if (already.length) log.textContent += `⚠️ ${file.name}: months ${already.join(', ')} already in DB — merging, skipping duplicates\n`;
          const added = await mergeTransactions(txs);
          totalAdded += added;
          log.textContent += `✅ ${file.name}: ${txs.length} transactions across ${months.length} month(s), ${added} new\n`;

          // Auto-extract closing balance from this statement
          const { balance, date: balDate } = extractBalanceFromText(text);
          if (balance !== null && balDate) {
            if (!latestBalanceDate || balDate > latestBalanceDate) {
              latestBalanceDate = balDate; latestBalance = balance;
            }
            log.textContent += `💰 Detected closing balance: ${fmtEur(balance)} (${balDate})\n`;
          }
        } catch (e) { log.textContent += `❌ ${file.name}: ${e.message}\n`; }
      }

      // Auto-update Sparkasse balance with the most recent closing balance found
      if (latestBalance !== null && latestBalanceDate) {
        const currentDate = S.config._lastBalanceDate || '';
        if (!currentDate || latestBalanceDate >= currentDate) {
          S.config.currentSparkasseBalance = latestBalance;
          S.config._lastBalanceDate = latestBalanceDate;
          const el = document.getElementById('cfg-sparkasse'); if (el) el.value = latestBalance;
          await dbSetConfig('main', S.config);
          // Log to sparkline history (keyed by month)
          const monthKey = latestBalanceDate.slice(0, 7);
          if (!S.balanceHistory.find(h => h.date === monthKey)) {
            const entry = { date: monthKey, balance: latestBalance };
            S.balanceHistory.push(entry);
            S.balanceHistory.sort((a, b) => a.date.localeCompare(b.date));
            await dbPut('balanceHistory', entry);
          }
        }
      }

      prog.innerHTML = `<div style="padding:10px;background:rgba(16,185,129,.1);border:1px solid var(--green);border-radius:7px;color:var(--green)">✅ Done! Added ${totalAdded} new transactions. <button class="btn btn-primary btn-sm" style="margin-left:10px" onclick="showTab('transactions')">View →</button></div>`;
      rebuildAll();
      renderOverview(); // always refresh overview cards after upload, regardless of active tab
      renderMonthGrid();
      showToast(`✅ Imported ${totalAdded} new transactions`);
    }

    async function readFileText(file) {
      if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
        return await extractPDFText(file);
      }
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsText(file, 'utf-8');
      });
    }

