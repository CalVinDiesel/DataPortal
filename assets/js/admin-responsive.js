/**
 * Admin data portal: overlay sidebar from top (like landing page) with close X button.
 * Run on DOMContentLoaded; works with assets/css/admin-responsive.css.
 */
(function () {
  function init() {
    var wrapper = document.querySelector('.layout-wrapper.layout-content-navbar');
    var menu = document.getElementById('layout-menu');
    if (!wrapper || !menu) return;
    var toggle = document.querySelector('.admin-menu-toggle');
    if (!toggle) return;
    var overlay = wrapper.querySelector('.layout-menu-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'layout-menu-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      wrapper.insertBefore(overlay, wrapper.firstChild);
    }
    function closeMenu() {
      wrapper.classList.remove('layout-menu-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    function toggleMenu() {
      wrapper.classList.toggle('layout-menu-open');
      var open = wrapper.classList.contains('layout-menu-open');
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    toggle.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);
    menu.querySelectorAll('.menu-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth < 1200) closeMenu();
      });
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1200) closeMenu();
    });
    var closeBtn = menu.querySelector('.admin-menu-close');
    if (!closeBtn) {
      closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'admin-menu-close';
      closeBtn.setAttribute('aria-label', 'Close menu');
      closeBtn.innerHTML = '<i class="bx bx-x"></i>';
      closeBtn.addEventListener('click', closeMenu);
      menu.insertBefore(closeBtn, menu.firstChild);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ─── Auto-inject theme switcher into every admin page navbar ───────────────
(function () {
  function injectThemeSwitcher() {
    var navRight = document.querySelector('.navbar-nav-right.d-flex.align-items-center.ms-auto');
    if (!navRight || document.querySelector('.dropdown-style-switcher')) return;

    var switcher = document.createElement('ul');
    switcher.className = 'navbar-nav flex-row align-items-center';
    switcher.innerHTML =
      '<li class="nav-item dropdown-style-switcher dropdown">' +
        '<a class="nav-link dropdown-toggle hide-arrow" id="nav-theme" href="javascript:void(0);" data-bs-toggle="dropdown">' +
          '<i class="icon-base bx bx-sun icon-lg theme-icon-active"></i>' +
        '</a>' +
        '<ul class="dropdown-menu dropdown-menu-end">' +
          '<li><button type="button" class="dropdown-item align-items-center" data-bs-theme-value="light">' +
            '<span><i class="icon-base bx bx-sun icon-md me-3"></i>Light</span></button></li>' +
          '<li><button type="button" class="dropdown-item align-items-center" data-bs-theme-value="dark">' +
            '<span><i class="icon-base bx bx-moon icon-md me-3"></i>Dark</span></button></li>' +
          '<li><button type="button" class="dropdown-item align-items-center" data-bs-theme-value="system">' +
            '<span><i class="icon-base bx bx-desktop icon-md me-3"></i>System</span></button></li>' +
        '</ul>' +
      '</li>';

      navRight.appendChild(switcher);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectThemeSwitcher);
  } else {
    injectThemeSwitcher();
  }
})();