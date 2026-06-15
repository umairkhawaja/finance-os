// ================================================================
// APP INIT + BOOTSTRAP
// Loaded last: every module above has defined its globals by now.
// ================================================================
async function init() {
  const badge = document.getElementById('dbStatusBadge');
  try {
    await openDB(); await loadAll(); rebuildSnapshots(); buildBudgetFields(); loadConfigUI(); refreshCategorySelects();
    badge.textContent = '✅ DB ready'; badge.className = 'db-status ok';
    renderOverview();
    if (window.onAppReady) window.onAppReady();
  } catch (e) {
    badge.textContent = '❌ DB error'; badge.style.color = 'var(--red)';
    console.error('DB init failed', e);
  }
}

// Called by init() once the DB + state are ready (see js/sync.js for the helpers).
window.onAppReady = async function () {
  loadSyncPrefs();
  updateSyncUI();
  updatePinUI();
  if (driveSignedIn()) { await cloudAutoReconcile(); }
};

// Kick everything off. init() is async, so the synchronous bootstrap calls
// below run before its continuation resumes (window.onAppReady is already set).
init();
handleOAuthReturn();
loadSyncPrefs();
showLockIfNeeded();
updatePinUI();
registerSW();
