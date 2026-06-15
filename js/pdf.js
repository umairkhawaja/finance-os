    // ================================================================
    // PDF TEXT EXTRACTOR — PDF.js (handles German encoding, all PDF formats)
    // Uses Y-position grouping so table columns (Date | Type | Amount)
    // land on the same output line. PDF.js correctly decodes font encoding
    // tables, compressed streams, and character mapping.
    //
    // PDF.js is loaded statically in <head> (cdn.jsdelivr.net).
    // ================================================================

    // Three-strategy PDF.js worker setup — returns configured lib or null
    // Strategy 1: In-process fake worker via MessageChannel (no worker-src CSP needed)
    // Strategy 2: Blob-URL worker (bypasses worker-src CDN restriction)
    // Strategy 3: External URL fallback
    async function getPDFjsAsync() {
      const lib = window.pdfjsLib;
      if (!lib) return null;
      // Cache promise so setup runs only once
      if (lib._wInit) return lib._wInit;
      lib._wInit = (async () => {
        // Strategy 1: pdf.worker.min.js was loaded as a script and sets window.pdfjsWorker
        if (window.pdfjsWorker?.WorkerMessageHandler) {
          try {
            const { port1, port2 } = new MessageChannel();
            port1.start(); port2.start();
            lib.GlobalWorkerOptions.workerPort = port1;
            // WorkerMessageHandler.setup accepts a MessagePort as its scope
            window.pdfjsWorker.WorkerMessageHandler.setup(port2);
            console.log('[PDF] In-process worker (MessageChannel) ready');
            return lib;
          } catch (e) {
            console.warn('[PDF] In-process worker failed:', e.message);
            try { lib.GlobalWorkerOptions.workerPort = undefined; } catch (_) { }
          }
        }
        // Strategy 2: fetch worker script → blob URL (blob: workers allowed when CDN workers blocked)
        try {
          const r = await fetch('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js');
          if (r.ok) {
            const blob = new Blob([await r.text()], { type: 'application/javascript' });
            lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
            console.log('[PDF] Blob-URL worker ready');
            return lib;
          }
        } catch (e) { console.warn('[PDF] Blob worker failed:', e.message); }
        // Strategy 3: external URL
        lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        console.log('[PDF] External worker URL set');
        return lib;
      })();
      return lib._wInit;
    }

    // Group items into lines by Y position, sort X left-to-right
    function itemsToLines(items, yTol = 3) {
      if (!items.length) return [];
      // Sort by y desc (PDF: y=0 at bottom, higher y = higher on page = earlier)
      const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      let curY = sorted[0].y, curRow = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].y - curY) <= yTol) curRow.push(sorted[i]);
        else { rows.push(curRow); curRow = [sorted[i]]; curY = sorted[i].y; }
      }
      rows.push(curRow);
      return rows.map(r => r.sort((a, b) => a.x - b.x).map(i => i.text).join('  ').trim()).filter(Boolean);
    }

    async function extractPDFText(file) {
      // Try PDF.js first — best quality (handles all encodings, ToUnicode maps, ligatures, etc.)
      const pdfjsLib = await getPDFjsAsync();
      if (pdfjsLib) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const allLines = [];
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent({ normalizeWhitespace: false });
            const items = textContent.items
              .filter(item => item.str && item.str.trim())
              .map(item => ({ x: item.transform[4], y: item.transform[5], text: item.str }));
            if (items.length) allLines.push(...itemsToLines(items, 6));
          }
          return allLines.join('\n');
        } catch (e) {
          console.warn('[PDF] PDF.js extraction failed, trying pure JS fallback:', e.message);
        }
      }
      // Pure JS fallback — zero external deps, uses browser's native DecompressionStream API
      return extractPDFTextPureJS(file);
    }

    function debugPDF() { document.getElementById('debugFileInput').click(); }
    async function runDebugExtract(file) {
      if (!file) return;
      showLoading('Extracting PDF text…');
      try {
        const text = await extractPDFText(file);
        hideLoading();
        const log = document.getElementById('parseLog');
        log.style.display = 'block';
        log.textContent = `=== RAW EXTRACTED TEXT (${text.split('\n').length} lines) ===\n\n${text.slice(0, 4000)}${text.length > 4000 ? '\n…(truncated)' : ''}`;
        log.scrollIntoView({ behavior: 'smooth' });
      } catch (e) { hideLoading(); showToast('❌ ' + e.message); }
    }

    // ================================================================
    // PURE JS PDF EXTRACTOR — DecompressionStream-based fallback
    // No external dependencies. Uses browser's native DecompressionStream API
    // for FlateDecode streams. Handles BT/ET text blocks, Td/Tm/TJ/Tj operators,
    // and WinAnsiEncoding (for German umlauts ä ö ü ß etc.).
    // ================================================================
    const _W1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
    function pdfW1252(code) { return code < 0x80 ? String.fromCharCode(code) : (_W1252[code] || String.fromCharCode(code)); }

    async function _pdfFlate(u8) {
      for (const fmt of ['deflate-raw', 'deflate']) {
        try {
          const ds = new DecompressionStream(fmt);
          const w = ds.writable.getWriter(); await w.write(u8); await w.close();
          const r = ds.readable.getReader(); const bufs = [];
          for (; ;) { const { done, value } = await r.read(); if (done) break; bufs.push(value); }
          const n = bufs.reduce((s, b) => s + b.length, 0); const out = new Uint8Array(n); let off = 0;
          for (const b of bufs) { out.set(b, off); off += b.length; } return out;
        } catch (e) { }
      }
      throw new Error('FlateDecode failed for this stream');
    }

    function _pdfDecStr(s) {
      // Decode PDF literal string escape sequences and WinAnsi high bytes
      let r = '';
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\' && i + 1 < s.length) {
          i++; const c = s[i];
          if (c === 'n') r += '\n'; else if (c === 'r') r += '\r'; else if (c === 't') r += '\t';
          else if (c === '(' || c === ')' || c === '\\') r += c;
          else if (c >= '0' && c <= '7') { let o = c; if (i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i]; if (i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i]; r += pdfW1252(parseInt(o, 8)); }
          else r += c;
        } else r += pdfW1252(s.charCodeAt(i));
      } return r;
    }

    function _pdfParseTJ(s) {
      // Parse [...] TJ array: strings contribute text, large negative numbers add a space
      let result = '', i = 0;
      while (i < s.length) {
        if (s[i] === '(') {
          let str = ''; i++; let depth = 1;
          while (i < s.length && depth > 0) {
            if (s[i] === '\\') {
              i++; if (i < s.length) {
                const c = s[i];
                if (c === 'n') str += '\n'; else if (c === 'r') str += '\r'; else if (c === 't') str += '\t';
                else if (c === '(' || c === ')' || c === '\\') str += c;
                else if (c >= '0' && c <= '7') { let o = c; if (i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i]; if (i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i]; str += pdfW1252(parseInt(o, 8)); }
                else str += c; i++;
              }
            }
            else if (s[i] === '(') { depth++; str += s[i++]; }
            else if (s[i] === ')') { depth--; if (depth > 0) str += s[i]; i++; }
            else { str += pdfW1252(s.charCodeAt(i)); i++; }
          } result += str;
        } else if (s[i] === '<') {
          // Hex string: <4E6F7465>
          i++; let hex = ''; while (i < s.length && s[i] !== '>') { if (s[i] !== ' ') hex += s[i]; i++; } i++;
          for (let j = 0; j < hex.length; j += 2)result += pdfW1252(parseInt(hex.slice(j, j + 2), 16) || 0);
        } else if (s[i] === '-' || s[i] === '+' || (s[i] >= '0' && s[i] <= '9')) {
          let num = ''; while (i < s.length && (s[i] === '-' || s[i] === '+' || s[i] === '.' || (s[i] >= '0' && s[i] <= '9'))) num += s[i++];
          if (parseFloat(num) < -100) result += ' '; // large negative kerning = word gap
        } else i++;
      } return result;
    }

    function _pdfParseBlock(block, items) {
      // Parse a BT...ET content stream block and push {x,y,text} items
      let x = 0, y = 0;
      const lines = block.split(/\r?\n/);
      for (const line of lines) {
        const l = line.trim(); if (!l) continue;
        let m;
        // Tm: a b c d e f Tm → absolute text matrix (e=x, f=y)
        if ((m = l.match(/^([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm$/))) { x = +m[5]; y = +m[6]; continue; }
        // Td/TD: dx dy → relative move
        if ((m = l.match(/^([-\d.]+)\s+([-\d.]+)\s+T[dD]$/))) { x += +m[1]; y += +m[2]; continue; }
        // T*: newline (moves down by leading, approximate as -12pt)
        if (l === 'T*') { y -= 12; continue; }
        // Tj: (string) Tj
        if ((m = l.match(/^\(([\s\S]*)\)\s*Tj\s*$/))) { const t = _pdfDecStr(m[1]); if (t.trim()) items.push({ x, y, text: t }); continue; }
        // TJ: [...] TJ
        if ((m = l.match(/^\[([\s\S]*)\]\s*TJ\s*$/))) { const t = _pdfParseTJ(m[1]); if (t.trim()) items.push({ x, y, text: t }); continue; }
        // ' (move to next line and show): (string) '
        if ((m = l.match(/^\(([\s\S]*)\)\s*'\s*$/))) { y -= 12; const t = _pdfDecStr(m[1]); if (t.trim()) items.push({ x, y, text: t }); continue; }
      }
    }

    async function extractPDFTextPureJS(file) {
      const buf = await file.arrayBuffer();
      const raw = new Uint8Array(buf);
      // Convert bytes to Latin-1 string for structure parsing (regex-safe for all byte values)
      let pdf = ''; for (let i = 0; i < raw.length; i++)pdf += String.fromCharCode(raw[i]);

      const items = []; // {x, y, text} — fed into the same itemsToLines() used by PDF.js path

      // Find all PDF objects: N G obj ... endobj
      const objRe = /\d+\s+\d+\s+obj([\s\S]*?)endobj/g;
      let m;
      while ((m = objRe.exec(pdf)) !== null) {
        const body = m[1];
        // Skip known non-content-stream object types
        if (/\/Type\s*\/(Font|XRef|ObjStm|FontDescriptor|Catalog|Pages)\b/.test(body)) continue;
        if (/\/Subtype\s*\/(Image|CIDFont)\b/.test(body)) continue;
        // Must have a stream
        const sIdx = body.indexOf('stream'); if (sIdx === -1) continue;
        let dStart = sIdx + 6;
        if (body[dStart] === '\r') dStart++; if (body[dStart] === '\n') dStart++;
        // Find endstream marker
        let eIdx = body.lastIndexOf('\nendstream');
        if (eIdx < 0) eIdx = body.lastIndexOf('\r\nendstream');
        if (eIdx < 0) eIdx = body.lastIndexOf('endstream') - 1;
        if (eIdx < 0 || eIdx <= dStart) continue;
        const streamStr = body.slice(dStart, eIdx);
        // Decompress if FlateDecode
        const hasFlate = /\/Filter\s*(?:\/FlateDecode|\[.*?FlateDecode.*?\])/.test(body);
        let content;
        if (hasFlate) {
          try {
            const bytes = new Uint8Array(streamStr.length);
            for (let i = 0; i < streamStr.length; i++)bytes[i] = streamStr.charCodeAt(i) & 0xFF;
            const dc = await _pdfFlate(bytes);
            content = ''; for (let i = 0; i < dc.length; i++)content += String.fromCharCode(dc[i]);
          } catch (e) { continue; } // can't decompress → skip
        } else {
          content = streamStr;
        }
        if (!content.includes('BT') || !content.includes('ET')) continue;
        // Parse BT...ET blocks
        let pos = 0;
        while (pos < content.length) {
          const btPos = content.indexOf('BT', pos); if (btPos === -1) break;
          // Ensure 'BT' is preceded by whitespace (not part of a longer word like "BTU")
          if (btPos > 0 && !/[\s\n\r(]/.test(content[btPos - 1])) { pos = btPos + 2; continue; }
          const etPos = content.indexOf('ET', btPos + 2); if (etPos === -1) break;
          _pdfParseBlock(content.slice(btPos + 2, etPos), items);
          pos = etPos + 2;
        }
      }

      if (!items.length) throw new Error('Pure JS PDF extractor found no text — try the Paste Text option below');
      return itemsToLines(items, 4).join('\n');
    }

    async function parsePastedText() {
      const text = document.getElementById('pasteArea').value.trim();
      if (!text) { showToast('⚠️ No text to parse'); return; }
      const txs = parsePDFText(text), added = await mergeTransactions(txs);
      showToast(`✅ Found ${txs.length} transactions, added ${added} new`);
      const log = document.getElementById('parseLog'); log.style.display = 'block'; log.textContent = `Parsed ${txs.length} transactions, ${added} added.\n`;
      renderMonthGrid(); rebuildAll();
    }

