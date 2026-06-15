// ================================================================
// THEME — light / dark, system-aware, persisted, chart-aware
// The anti-FOUC inline script in <head> already sets data-theme on
// first paint; this wires the toggle button and keeps charts in sync.
// ================================================================
(function () {
  const KEY = 'fos_theme';
  const mq = window.matchMedia('(prefers-color-scheme: light)');

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function resolved() {
    const s = stored();
    return (s === 'light' || s === 'dark') ? s : (mq.matches ? 'light' : 'dark');
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', theme === 'light' ? '#f4f5fb' : '#0f1117');
    const cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) {
      const next = theme === 'light' ? 'dark' : 'light';
      btn.textContent = theme === 'light' ? '🌙' : '☀️';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      btn.setAttribute('title', 'Switch to ' + next + ' theme');
    }
  }

  // Charts read colours from CSS vars (see chartDefaults), so re-render to recolour.
  function recolourCharts() { if (typeof rebuildAll === 'function') rebuildAll(); }

  window.toggleTheme = function () {
    const next = resolved() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, next); } catch (e) { }
    apply(next);
    recolourCharts();
  };

  // Follow the OS setting while the user hasn't made an explicit choice.
  mq.addEventListener('change', function () {
    if (!stored()) { apply(resolved()); recolourCharts(); }
  });

  apply(resolved());
})();
