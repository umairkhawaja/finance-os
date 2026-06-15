    // ================================================================
    // GOOGLE DRIVE SYNC  (redirect implicit OAuth → no popups, works in
    // macOS Safari/Chrome and the iOS standalone home-screen web app)
    // + APP PIN LOCK + PWA SERVICE WORKER REGISTRATION
    // ================================================================
    const DRIVE = {
      CLIENT_ID: '408463852317-ol63mj6hsbsvputlgod3e5nlr2o1b2s6.apps.googleusercontent.com',
      SCOPE: 'https://www.googleapis.com/auth/drive.appdata',
      STATE_FILE: 'financeos-state.json',
      BACKUP_PREFIX: 'financeos-backup-',
      MAX_BACKUPS: 15,
      token: null, expiry: 0, syncing: false
    };
    let _syncTimer = null, _suspendSync = false;
    let syncPrefs = { auto: true };

    function loadSyncPrefs() { try { syncPrefs = Object.assign({ auto: true }, JSON.parse(localStorage.getItem('fos_sync_prefs') || '{}')); } catch (e) { } }
    function saveSyncPrefs() { const cb = document.getElementById('cfg-autosync'); syncPrefs.auto = cb ? cb.checked : true; try { localStorage.setItem('fos_sync_prefs', JSON.stringify(syncPrefs)); } catch (e) { } }

    function driveRedirectUri() {
      // MUST exactly match an Authorized redirect URI in the Google Cloud console.
      return location.origin + location.pathname.replace(/index\.html$/, '');
    }
    function driveSignedIn() { return !!DRIVE.token && DRIVE.expiry > Date.now(); }

    function driveSignIn(interactive) {
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('fos_oauth_state', state); } catch (e) { }
      const p = new URLSearchParams({
        client_id: DRIVE.CLIENT_ID,
        redirect_uri: driveRedirectUri(),
        response_type: 'token',
        scope: DRIVE.SCOPE,
        include_granted_scopes: 'true',
        state,
        prompt: interactive ? 'consent select_account' : 'none'
      });
      // Full-page redirect (not a popup) — this is the key to working inside the
      // iOS standalone PWA and avoiding macOS popup blockers.
      location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
    }

    function handleOAuthReturn() {
      if (location.hash && location.hash.indexOf('access_token=') >= 0) {
        const h = new URLSearchParams(location.hash.slice(1));
        const token = h.get('access_token');
        const expiresIn = parseInt(h.get('expires_in') || '3600', 10);
        const state = h.get('state');
        let saved = ''; try { saved = sessionStorage.getItem('fos_oauth_state') || ''; } catch (e) { }
        // Strip the fragment immediately so the token never lingers in the URL/history.
        history.replaceState(null, '', location.pathname + location.search);
        if (token && state && state === saved) {
          DRIVE.token = token; DRIVE.expiry = Date.now() + (expiresIn - 90) * 1000;
          try { localStorage.setItem('fos_drive_tok', JSON.stringify({ t: token, e: DRIVE.expiry })); } catch (e) { }
          try { sessionStorage.removeItem('fos_oauth_state'); } catch (e) { }
          return true;
        }
        return false;
      }
      try {
        const s = JSON.parse(localStorage.getItem('fos_drive_tok') || 'null');
        if (s && s.e > Date.now()) { DRIVE.token = s.t; DRIVE.expiry = s.e; return true; }
      } catch (e) { }
      return false;
    }

    function driveSignOut() {
      DRIVE.token = null; DRIVE.expiry = 0;
      try { localStorage.removeItem('fos_drive_tok'); } catch (e) { }
      updateSyncUI(); showToast('Disconnected from Google Drive');
    }

    async function driveFetch(url, opts) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: 'Bearer ' + DRIVE.token }, opts.headers || {});
      const r = await fetch(url, opts);
      if (r.status === 401) { driveSignOut(); throw new Error('Google session expired — reconnect Drive'); }
      return r;
    }

    async function driveFindFile(name) {
      const q = encodeURIComponent(`name='${name}'`);
      const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Drive list failed');
      return (d.files && d.files[0]) ? d.files[0] : null;
    }
    async function driveListBackups() {
      const q = encodeURIComponent("name contains '" + DRIVE.BACKUP_PREFIX + "'");
      const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`);
      const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'list failed');
      return d.files || [];
    }
    async function driveDownload(id) {
      const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
      if (!r.ok) throw new Error('Download failed'); return await r.json();
    }
    async function driveUpload(name, obj, existingId) {
      if (existingId) {
        const r = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'Upload failed'); return d;
      }
      const boundary = '-------fos' + Date.now();
      const meta = { name, parents: ['appDataFolder'] };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(meta) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        JSON.stringify(obj) +
        `\r\n--${boundary}--`;
      const r = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'Upload failed'); return d;
    }
    async function driveDelete(id) { try { await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }); } catch (e) { } }

    function buildSnapshot() {
      return {
        schema: 2, savedAt: new Date().toISOString(),
        transactions: S.transactions, portfolioEntries: S.portfolioEntries,
        balanceHistory: S.balanceHistory, config: S.config
      };
    }
    async function applySnapshot(snap) {
      if (snap.transactions) { await dbClear('transactions'); for (const t of snap.transactions) await dbPut('transactions', t); }
      if (snap.portfolioEntries) { await dbClear('portfolioEntries'); for (const e of snap.portfolioEntries) await dbPut('portfolioEntries', e); }
      if (snap.balanceHistory) { await dbClear('balanceHistory'); for (const h of snap.balanceHistory) await dbPut('balanceHistory', h); }
      if (snap.config) await dbSetConfig('main', snap.config);
      await loadAll(); rebuildSnapshots(); loadConfigUI(); buildBudgetFields(); rebuildAll(); renderOverview();
    }

    function scheduleSync() {
      if (_suspendSync) return;
      if (!syncPrefs.auto) return;
      if (!driveSignedIn()) return;
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => cloudPush(true), 4000);
    }

    async function cloudPull(silent) {
      if (!driveSignedIn()) { if (!silent) { showToast('Connect Google Drive first'); showTab('settings'); } return; }
      setSync('syncing', 'Pulling…');
      try {
        const f = await driveFindFile(DRIVE.STATE_FILE);
        if (!f) { setSync('ok', 'No cloud data'); if (!silent) showToast('No backup in Drive yet'); return; }
        const snap = await driveDownload(f.id);
        _suspendSync = true; await applySnapshot(snap); _suspendSync = false;
        try { localStorage.setItem('fos_local_savedAt', snap.savedAt || ''); } catch (e) { }
        setSync('ok', 'Synced'); if (!silent) showToast('⬇️ Loaded data from Drive');
      } catch (e) { _suspendSync = false; setSync('err', 'Error'); showToast('❌ ' + e.message); }
    }

    async function cloudPush(silent) {
      if (!driveSignedIn()) { if (!silent) { showToast('Connect Google Drive first'); showTab('settings'); } return; }
      if (DRIVE.syncing) return;
      DRIVE.syncing = true; setSync('syncing', 'Saving…');
      try {
        const snap = buildSnapshot();
        const f = await driveFindFile(DRIVE.STATE_FILE);
        await driveUpload(DRIVE.STATE_FILE, snap, f ? f.id : null);
        try { localStorage.setItem('fos_local_savedAt', snap.savedAt); } catch (e) { }
        await maybeDailyBackup(snap);
        setSync('ok', 'Saved ' + new Date().toLocaleTimeString());
        if (!silent) showToast('⬆️ Saved to Drive');
      } catch (e) { setSync('err', 'Error'); if (!silent) showToast('❌ ' + e.message); }
      finally { DRIVE.syncing = false; }
    }

    async function maybeDailyBackup(snap) {
      const today = new Date().toISOString().slice(0, 10);
      let last = ''; try { last = localStorage.getItem('fos_last_backup') || ''; } catch (e) { }
      if (last === today) return;
      try {
        await driveUpload(DRIVE.BACKUP_PREFIX + today + '.json', snap, null);
        try { localStorage.setItem('fos_last_backup', today); } catch (e) { }
        const backups = await driveListBackups();
        for (const b of backups.slice(DRIVE.MAX_BACKUPS)) await driveDelete(b.id);
      } catch (e) { /* backup is best-effort */ }
    }

    async function cloudRestoreBackup() {
      if (!driveSignedIn()) { showToast('Connect Google Drive first'); showTab('settings'); return; }
      document.getElementById('backupModal').classList.add('open');
      const el = document.getElementById('backupList'); el.textContent = 'Loading…';
      try {
        const list = await driveListBackups();
        if (!list.length) { el.textContent = 'No backups yet. One is created automatically per day once Drive is connected.'; return; }
        el.innerHTML = list.map(b => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><span>${esc(b.name.replace(DRIVE.BACKUP_PREFIX, '').replace('.json', ''))}<br><span style="color:var(--muted);font-size:11px">${new Date(b.modifiedTime).toLocaleString()}</span></span><button class="btn btn-primary btn-sm" onclick="restoreBackup('${b.id}')">Restore</button></div>`).join('');
      } catch (e) { el.textContent = '❌ ' + e.message; }
    }
    async function restoreBackup(id) {
      if (!confirm('Restore this backup? It will replace your current local data.')) return;
      setSync('syncing', 'Restoring…');
      try {
        const snap = await driveDownload(id);
        _suspendSync = true; await applySnapshot(snap); _suspendSync = false;
        closeModal('backupModal'); setSync('ok', 'Restored'); showToast('✅ Backup restored');
      } catch (e) { _suspendSync = false; setSync('err', 'Error'); showToast('❌ ' + e.message); }
    }

    function cloudSyncNow() { if (driveSignedIn()) cloudPush(false); else driveSignIn(true); }

    async function cloudAutoReconcile() {
      setSync('syncing', 'Checking…');
      try {
        const f = await driveFindFile(DRIVE.STATE_FILE);
        const localEmpty = !(S.transactions.length || S.portfolioEntries.length);
        if (!f) { if (!localEmpty) await cloudPush(true); else setSync('ok', 'on'); return; }
        const snap = await driveDownload(f.id);
        let localSaved = ''; try { localSaved = localStorage.getItem('fos_local_savedAt') || ''; } catch (e) { }
        const remoteSaved = snap.savedAt || '';
        if (localEmpty) {
          _suspendSync = true; await applySnapshot(snap); _suspendSync = false;
          try { localStorage.setItem('fos_local_savedAt', remoteSaved); } catch (e) { }
          setSync('ok', 'Synced'); showToast('⬇️ Synced from Drive');
        } else if (!localSaved) {
          // Local data exists but was never linked to this cloud file — ask the user.
          if (confirm('A cloud backup was found.\n\nOK = use the CLOUD copy (replaces this device).\nCancel = keep THIS device and overwrite the cloud.')) {
            _suspendSync = true; await applySnapshot(snap); _suspendSync = false;
            try { localStorage.setItem('fos_local_savedAt', remoteSaved); } catch (e) { }
            setSync('ok', 'Synced'); showToast('⬇️ Synced from Drive');
          } else { await cloudPush(true); }
        } else if (remoteSaved > localSaved) {
          _suspendSync = true; await applySnapshot(snap); _suspendSync = false;
          try { localStorage.setItem('fos_local_savedAt', remoteSaved); } catch (e) { }
          setSync('ok', 'Synced'); showToast('⬇️ Synced from Drive');
        } else if (localSaved > remoteSaved) {
          await cloudPush(true);
        } else { setSync('ok', 'Up to date'); }
      } catch (e) { _suspendSync = false; setSync('err', 'Error'); }
    }

    function setSync(state, msg) {
      const b = document.getElementById('syncBadge'); if (!b) return;
      const icons = { off: '☁︎', ok: '☁︎✓', syncing: '☁︎…', err: '☁︎!' };
      b.textContent = (icons[state] || '☁︎') + (msg ? (' ' + msg) : '');
      b.className = 'db-status' + (state === 'ok' ? ' ok' : '');
      b.style.color = state === 'err' ? 'var(--red)' : state === 'syncing' ? 'var(--yellow)' : '';
    }
    function updateSyncUI() {
      const connected = driveSignedIn();
      const ds = document.getElementById('driveStatus');
      if (ds) ds.innerHTML = connected ? '✅ Connected to your Google Drive (appDataFolder)' : 'Not connected';
      const cb = document.getElementById('driveConnectBtn'); if (cb) cb.textContent = connected ? '🔄 Reconnect' : '🔗 Connect Google Drive';
      const ac = document.getElementById('cfg-autosync'); if (ac) ac.checked = !!syncPrefs.auto;
      setSync(connected ? 'ok' : 'off', connected ? 'on' : 'off');
    }

    // ---- APP PIN LOCK ----
    async function sha256(str) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    function pinIsSet() { try { return !!localStorage.getItem('fos_pin'); } catch (e) { return false; } }
    function showLockIfNeeded() {
      if (pinIsSet()) {
        document.getElementById('lockOverlay').classList.add('show');
        setTimeout(() => { const i = document.getElementById('lockPin'); if (i) i.focus(); }, 250);
      }
    }
    async function tryUnlock() {
      const v = document.getElementById('lockPin').value;
      const h = await sha256(v);
      let stored = ''; try { stored = localStorage.getItem('fos_pin') || ''; } catch (e) { }
      if (h === stored) {
        document.getElementById('lockOverlay').classList.remove('show');
        document.getElementById('lockPin').value = '';
        document.getElementById('lockErr').textContent = '';
      } else {
        document.getElementById('lockErr').textContent = 'Wrong PIN';
        document.getElementById('lockPin').value = '';
      }
    }
    async function setPinPrompt() {
      const p = prompt('Enter a new PIN (at least 4 characters):'); if (p === null) return;
      if (p.length < 4) { showToast('PIN must be at least 4 characters'); return; }
      const c = prompt('Confirm the PIN:'); if (c !== p) { showToast('PINs did not match'); return; }
      try { localStorage.setItem('fos_pin', await sha256(p)); } catch (e) { }
      updatePinUI(); showToast('🔒 PIN set — it will be required next time you open the app');
    }
    function removePin() {
      if (!pinIsSet()) { showToast('No PIN set'); return; }
      if (confirm('Remove the app PIN?')) { try { localStorage.removeItem('fos_pin'); } catch (e) { } updatePinUI(); showToast('PIN removed'); }
    }
    function updatePinUI() { const el = document.getElementById('pinStatus'); if (el) el.innerHTML = pinIsSet() ? '🔒 A PIN is set' : 'No PIN set'; }

    // ---- PWA SERVICE WORKER ----
    function registerSW() {
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => { navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW registration failed', e)); });
      }
    }

