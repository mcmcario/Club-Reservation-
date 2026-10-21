(() => {
  let savedTheme;
  try { savedTheme = localStorage.getItem('qc-after-dark-theme'); } catch { /* Cookie fallback below. */ }
  if (!savedTheme) savedTheme = document.cookie.split('; ').find(item => item.startsWith('qc_theme='))?.split('=')[1];
  document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'light' ? '#f7f5fb' : '#030307';
})();
