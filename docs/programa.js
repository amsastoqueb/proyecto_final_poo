// js/programa.js
// Funciones pequeñas para mejorar la UX: resaltar link activo, toggle menú móvil, cargar hero background sin flash, smooth scroll.
document.addEventListener('DOMContentLoaded', function () {

  // --- 1) Resaltar el enlace activo en la nav según el archivo actual ---
  (function setActiveNav(){
    try {
      const links = document.querySelectorAll('header nav a');
      if (!links.length) return;
      const current = window.location.pathname.split('/').pop() || 'index.html';
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const file = href.split('/').pop();
        if (file === current) link.classList.add('active');
        else link.classList.remove('active');
      });
    } catch (err) {
      console.error('setActiveNav:', err);
    }
  })();

  // --- 2) Toggle menú móvil (si agregas el botón #menu-toggle) ---
  (function mobileMenuToggle(){
    const btn = document.getElementById('menu-toggle');
    const nav = document.getElementById('main-nav') || document.querySelector('header nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function (e) {
      nav.classList.toggle('open');
      const expanded = nav.classList.contains('open');
      btn.setAttribute('aria-expanded', String(expanded));
    });

    // Cerrar nav al hacer clic fuera (opcional)
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || e.target === btn) return;
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  })();

  // --- 3) Cargar imagen de hero (background) y agregar clase para transición ---
  (function heroBgLoader(){
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const bg = window.getComputedStyle(hero).backgroundImage;
    const match = bg && bg.match(/url\(["']?(.+?)["']?\)/);
    if (!match) {
      hero.classList.add('hero--loaded');
      return;
    }
    const img = new Image();
    img.src = match[1];
    img.onload = function () { hero.classList.add('hero--loaded'); };
    img.onerror = function () { hero.classList.add('hero--loaded'); };
  })();

  // --- 4) Smooth scroll para anclas internas (seguro y útil) ---
  (function smoothAnchors(){
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  })();

});