    // ================================================================
    // PARSER — Stadtsparkasse München format
    // ================================================================
    // Sparkasse PDFs are tables. PDF.js extracts items with X,Y coords.
    // After Y-grouping (yTol=6), each row lands as one text line:
    //   "DD.MM.YYYY  TYPE  [desc]  AMOUNT"
    // Amount may be on the same line (inline) or on a continuation line
    // mixed with description text — both cases are handled below.

    const TX_TYPE_PATTERN =
      'Apple Pay|Kartenzahlung|Lastschrift|Folgelastschrift|Basislastschrift|' +
      'Überweisung Echtzeit|Ueberweisung Echtzeit|' +
      'GutschriftÜberweisung|Gutschrift Überweisung|GutschriftUeberweisung|Gutschrift Ueberweisung|' +
      'Gutschrift|Überweisung|Ueberweisung|' +
      'Dauerauftrag|Lohn, Gehalt, Rente|Lohn,\\s*Gehalt|' +
      'Bargeldausz\\.Debitk\\.GA|Bargeldauszahlung|Bargeldausz\\.|Bargeldeinzahlung SB|Bargeldeinzahlung|' +
      'Entgeltabrechnung|Rechnungsabschluss|Wertpapiere|Einzahlung';

    // Matches start of a transaction line: DD.MM.YYYY TYPE
    const TX_START_RE = new RegExp(
      '^(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(' + TX_TYPE_PATTERN + ')',
      'i'
    );
    // German decimal amount at end of a string
    const AMT_END_RE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
    // Entire line is just an amount (no leading-space requirement — extracted lines are trimmed)
    const AMT_ONLY_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;

    const SKIP_TYPES = /^(Entgeltabrechnung|Rechnungsabschluss)/i;
    const SKIP_DESC = /KREDITKARTENABRECHNUNG|Amazon Visa Kreditkarte/i;
    const INCOME_TYPES = /^(GutschriftÜberweisung|Gutschrift Überweisung|GutschriftUeberweisung|Gutschrift Ueberweisung|Gutschrift|Lohn, Gehalt, Rente|Lohn,\s*Gehalt|Bargeldeinzahlung SB|Bargeldeinzahlung|Einzahlung)/i;
    const JUNK_LINE = /^(Kontostand am|Seite \d|Stadtsparkasse|Privatgirokonto|Kontoauszug \d|Datum\s+Erl|Betrag Soll|Betrag Haben|Herrn|Khawaja|H.lderlinstr|Hölderlinstr|M.nchen|München|Munchen|Ihr Ansprechpartner|Telefon|Finanzberatung|Anschrift|Zentrale|Verwaltung|Amtsgericht|Ust-IdNr|SWIFT|BLZ|HRA|www\.|Telefax|Kontonummer|IBAN:|BIC:|Blatt)/i;

    function parseAmt(s) { return parseFloat(s.replace(/\./g, '').replace(',', '.')); }

    function extractMerchant(desc, type) {
      let m;
      // PayPal: "Ihr Einkauf bei MERCHANT ..."
      m = desc.match(/Ihr Einkauf bei ([^0-9\/\n,]+?)(?:\s+\d|\s*$)/i);
      if (m) return m[1].trim().replace(/\s+$/, '');
      // Klarna: "Purchase at MERCHANT ..."
      m = desc.match(/Purchase at ([A-Za-zÄÖÜäöüß0-9\s\-\.&]+?)(?:\s+[0-9a-f]{8}|\s*$)/i);
      if (m) return m[1].trim();
      // Apple Pay / Kartenzahlung: "MERCHANT SAGT DANKE" or "MERCHANT//CITY"
      m = desc.match(/^(.+?)(?:\s+SAGT DANKE|\/\/)/i);
      if (m) return m[1].trim().replace(/\s+\d+\s*$/, '').trim();
      // Cash withdrawal
      if (/^Bargeldausz/i.test(type)) return 'Cash Withdrawal';
      if (/^Bargeldeinzahlung/i.test(type)) return 'Cash Deposit';
      // Zenseact salary
      if (/ZENSEACT/i.test(desc)) return 'Zenseact Salary';
      // Tax refund
      if (/FINANZAMT/i.test(desc)) return 'Tax Refund';
      // Rent (Dauerauftrag to a person/company)
      if (/^Dauerauftrag/i.test(type)) {
        const first = desc.split(/\s+/).slice(0, 3).join(' ');
        return first || type;
      }
      // Fallback
      return desc.split(/\/|Gläubiger|Mandat|IBAN/)[0].trim().slice(0, 50).trim() || type;
    }

    // Evaluate user-defined rules (S.config.rules) in order. Returns a category
    // string on first match, or null if none apply. `match` supports '&' to AND
    // multiple substrings (all must be present). Field selects which text to scan.
    function applyRules(desc, type, amount) {
      const rules = (S.config && S.config.rules) || [];
      const descL = (desc || '').toLowerCase();
      const typeL = (type || '').toLowerCase();
      const abs = Math.abs(amount);
      for (const r of rules) {
        if (!r || r.enabled === false || !r.match || !r.category) continue;
        const hay = r.field === 'desc' ? descL : r.field === 'type' ? typeL : descL + ' ' + typeL;
        const terms = r.match.toLowerCase().split('&').map(s => s.trim()).filter(Boolean);
        if (!terms.length || !terms.every(t => hay.includes(t))) continue;
        if (r.minAmount != null && abs < r.minAmount) continue;
        if (r.maxAmount != null && abs > r.maxAmount) continue;
        return r.category;
      }
      return null;
    }

    function autoCategory(desc, type, amount) {
      const ruled = applyRules(desc, type, amount);
      if (ruled) return ruled;
      const d = (desc + ' ' + type).toLowerCase();
      if (INCOME_TYPES.test(type) || (amount > 0 && /gehalt|lohn|salary|zenseact|finanzamt|airhelp/.test(d))) return 'income';
      if (/wertpapiere|scalable|trade republic|etf|fonds/.test(d)) return 'investment';
      if (/miete|wohnung|hausverwalt|untermiete/.test(d)) return 'rent';
      if (Math.abs(amount) >= 790 && Math.abs(amount) <= 810 && /dauerauftrag/i.test(type)) return 'rent';
      if (/rewe|aldi|lidl|norma|edeka|penny|supermarkt istanbul|supermarkt istambul|ernst lebensmittel|hoeflinger|mueller|mcdonald|pizza hut|wolt|five guys|pommes|burger|momos|khan baba|yade kebab|oz urfa|shawarma|nguyen kitchen|espresso house|eurotrade|annes haus|tadastithi|landbaeckerei|gdc deutschland|caf am schloss|kiosk|alperen|esen supermarkt|bäckerei|backerei|lieferando|uber eats/.test(d)) return 'food';
      if (/db vertrieb|deutsche bahn|mvg|mopla|flixbus|bolt|tankstelle|shell|aral|parking/.test(d) && !/adidas/.test(d)) return 'transport';
      if (/zalando|arket|breuninger|about you|mango|h&m|h\.m|adidas|temu|ditur|amevista|ikea|kaufland|flaconi|notino|dm drogerie|fielmann|amazon|zara|saturn|mediamarkt|rossmann|cash withdrawal|boogs home|vintagewerkstatt/.test(d)) return 'shopping';
      if (/wise\.com|wise transfer|transferwise|western union|moneygram|remitly|instarem|azimo|worldremit|pangea|ria money|remittance|pakistan|int.*transfer|international.*bank/.test(d)) return 'remittance';
      if (/popsure/.test(d)) return 'insurance';
      if (/taxfix|disney|apple servi|apple services|telekom|minimax|mfi|munchner forum|munchen forum|sparkasse/.test(d)) return 'subscriptions';
      if (/netflix|spotify|apple|google|adobe|dazn|youtube|chatgpt|notion|github/.test(d)) return 'subscriptions';
      if (/urologie|klinikum|apotheke|loewen|hausarzt|body up|body.*motion|fit star|fitness|gym|sport/.test(d)) return 'health';
      if (/booking\.com|qatar airways|airbnb|ryanair|easyjet|lufthansa|flughafen/.test(d) && !/eurotrade/.test(d)) return 'transport'; // travel → transport
      if (/moonflash|kino|theater|museum|eventim|ticketmaster/.test(d)) return 'entertainment';
      return 'other';
    }

    function parsePDFText(text) {
      const lines = text.split('\n');
      const txs = [];
      let i = 0;

      while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();
        const startM = TX_START_RE.exec(trimmed);

        if (!startM) { i++; continue; }

        const dateStr = startM[1];
        const txType = startM[2].trim();
        const [dd, mm, yyyy] = dateStr.split('.');
        const date = `${yyyy}-${mm}-${dd}`;

        if (SKIP_TYPES.test(txType)) { i++; continue; }

        // Everything after "DD.MM.YYYY TYPE" on this same line
        const afterType = trimmed.slice(startM[0].length).trim();

        let amount = null;
        const descLines = [];

        // Check for inline amount at end of the first line
        const inlineAmtM = AMT_END_RE.exec(afterType);
        if (inlineAmtM) {
          amount = parseAmt(inlineAmtM[1]);
          // Description = everything between type and amount on this line
          const firstDesc = afterType.slice(0, afterType.length - inlineAmtM[0].length).trim();
          if (firstDesc) descLines.push(firstDesc);
        } else {
          // No inline amount — keep the whole first-line remainder as description
          if (afterType) descLines.push(afterType);
        }

        // Collect continuation lines (descriptions and/or amounts on subsequent rows)
        i++;
        while (i < lines.length) {
          const nl = lines[i];
          const nlt = nl.trim();

          if (!nlt) { i++; continue; }            // blank line → skip
          if (TX_START_RE.exec(nlt)) break;       // next transaction → stop
          if (JUNK_LINE.test(nlt)) { i++; continue; } // header/footer junk → skip

          // Case 1: entire line is just an amount  e.g. "42,10" or "2.800,00"
          if (AMT_ONLY_RE.test(nlt)) {
            if (amount === null) amount = parseAmt(nlt);
            i++; continue; // don't break — description lines can follow
          }

          // Case 2: line ends with an amount mixed with description text
          // e.g. "REWE SAGT DANKE 46400325  42,10"
          const trailM = AMT_END_RE.exec(nlt);
          if (trailM) {
            if (amount === null) amount = parseAmt(trailM[1]);
            const descPart = nlt.slice(0, nlt.length - trailM[0].length).trim();
            if (descPart) descLines.push(descPart);
            i++; continue;
          }

          // Case 3: plain description line
          descLines.push(nlt);
          i++;
        }

        if (amount === null) continue; // no amount found → skip

        const fullDesc = descLines.join(' ').trim();
        if (SKIP_DESC.test(fullDesc) || SKIP_DESC.test(afterType)) continue;

        const merchant = extractMerchant(fullDesc, txType);
        const description = merchant || fullDesc.slice(0, 60) || txType;
        // Sparkasse PDFs omit minus signs (sign implied by Soll vs Haben column).
        // We enforce sign from transaction type rather than the raw number.
        const signedAmount = INCOME_TYPES.test(txType) ? Math.abs(amount) : -Math.abs(amount);
        const category = autoCategory(fullDesc, txType, signedAmount);
        const id = `${date}-${Math.abs(signedAmount)}-${Math.random().toString(36).slice(2, 7)}`;

        txs.push({ id, date, type: txType, description, amount: signedAmount, category, source: 'pdf', rawDesc: fullDesc });
      }

      return txs;
    }
