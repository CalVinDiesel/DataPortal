(function () {
    'use strict';
  
    var STORAGE_KEY = 'appTheme';
    var iconMap = { light: 'bx-sun', dark: 'bx-moon', system: 'bx-desktop' };
  
    function applyTheme(theme) {
      var resolved = theme;
      if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-bs-theme', resolved);
    }
  
    function updateUI(theme) {
      document.querySelectorAll('[data-bs-theme-value]').forEach(function (btn) {
        var active = btn.getAttribute('data-bs-theme-value') === theme;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
  
      var navIcon = document.querySelector('.theme-icon-active');
      if (navIcon && iconMap[theme]) {
        navIcon.className = navIcon.className
          .replace(/\bbx-sun\b|\bbx-moon\b|\bbx-desktop\b/, iconMap[theme]);
      }
    }
  
    function setTheme(theme) {
      localStorage.setItem(STORAGE_KEY, theme);
      applyTheme(theme);
      updateUI(theme);
    }
  
    document.addEventListener('DOMContentLoaded', function () {
      var saved = localStorage.getItem(STORAGE_KEY) || 'light';
      updateUI(saved);
  
      document.querySelectorAll('[data-bs-theme-value]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setTheme(this.getAttribute('data-bs-theme-value'));
        });
      });
  
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (localStorage.getItem(STORAGE_KEY) === 'system') {
          applyTheme('system');
        }
      });
    });
  })();