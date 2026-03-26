(function () {
    var STORAGE_KEY = 'appTheme';
    var saved = localStorage.getItem(STORAGE_KEY) || 'light';
  
    if (saved === 'system') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-bs-theme', saved);
    }
  })();