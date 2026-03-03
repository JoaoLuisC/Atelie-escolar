/**
 * ANIMATIONS.JS — Efeitos visuais avançados
 * Scroll reveal · Counters · Sticky horizontal scroll · Cursor trail
 */

(function () {
  'use strict';

  /* ─── Cursor trail escolar (desktop, só no hero) ────── */
  function initCursorTrail() {
    if (window.innerWidth < 1024) return;
    const hero = document.querySelector('.hero-animated');
    if (!hero) return;

    const SYMBOLS = ['⭐','📚','✏️','🎨','📐','✨','🌈','🎒','🖊️','🔢','📏','🌟'];
    const COLORS = ['#5C2899','#921663','#9A7A00','#005C8A','#007A65'];
    let lastSpawn = 0;
    const THROTTLE = 45;
    let insideHero = false;

    hero.addEventListener('mouseenter', () => { insideHero = true;  });
    hero.addEventListener('mouseleave', () => { insideHero = false; });

    document.addEventListener('mousemove', (e) => {
      if (!insideHero) return;
      const now = Date.now();
      if (now - lastSpawn < THROTTLE) return;
      lastSpawn = now;
      spawnParticle(e.clientX, e.clientY);
    }, { passive: true });

    function spawnParticle(x, y) {
      const el = document.createElement('span');
      el.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

      const size  = 13 + Math.random() * 12;
      const angle = Math.random() * 360;
      const dist  = 35 + Math.random() * 55;
      const dx    = Math.cos(angle * Math.PI / 180) * dist;
      const dy    = Math.sin(angle * Math.PI / 180) * dist - 28;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const dur   = 650 + Math.random() * 450;

      Object.assign(el.style, {
        position:      'fixed',
        left:          x + 'px',
        top:           y + 'px',
        fontSize:      size + 'px',
        color:         color,
        pointerEvents: 'none',
        zIndex:        9999,
        userSelect:    'none',
        lineHeight:    1,
        transform:     'translate(-50%, -50%)',
        transition:    `transform ${dur}ms ease-out, opacity ${dur}ms ease-out`,
        opacity:       0.6,
        willChange:    'transform, opacity',
      });

      document.body.appendChild(el);
      el.getBoundingClientRect();

      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2) rotate(${angle}deg)`;
      el.style.opacity   = '0';

      setTimeout(() => el.remove(), dur + 50);
    }
  }

  /* ─── Navbar scroll effect ───────────────────────────────── */
  function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    window.addEventListener('scroll', () => {
      const isScrolled = window.scrollY > 80;
      navbar.classList.toggle('scrolled', isScrolled);
      // Remove transparent class once user scrolls
      if (isScrolled) navbar.classList.remove('navbar-transparent');
      else navbar.classList.add('navbar-transparent');
    }, { passive: true });
  }

  /* ─── Scroll reveal (Intersection Observer) ─────────────── */
  function initScrollReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach((el) => observer.observe(el));
  }

  /* ─── Animated counter ───────────────────────────────────── */
  function animateCounter(el) {
    const target  = parseInt(el.dataset.target, 10);
    const prefix  = el.dataset.prefix  || '';
    const suffix  = el.dataset.suffix  || '';
    const duration = 2000;
    const start   = performance.now();

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function step(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value    = Math.round(easeOutQuart(progress) * target);
      el.textContent = prefix + value.toLocaleString('pt-BR') + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach((c) => observer.observe(c));
  }

  /* ─── Horizontal sticky scroll ───────────────────────────── */
  function initStickyHorizontalScroll() {
    const outer   = document.querySelector('.sticky-scroll-outer');
    const track   = document.querySelector('.sticky-scroll-track');
    const inner   = document.querySelector('.sticky-scroll-inner');
    const dots    = document.querySelectorAll('.panel-dot');
    const progBar = document.querySelector('.panel-progress-bar');
    const miniSteps = document.querySelectorAll('.mini-step');

    if (!outer || !track) return;

    // Em mobile o efeito é desabilitado pelo CSS
    if (window.innerWidth < 768) return;

    const panels     = track.querySelectorAll('.sticky-panel');
    const panelCount = panels.length;
    // scrollavel = altura do outer − altura da viewport
    const getScrollable = () => outer.offsetHeight - window.innerHeight;

    function onScroll() {
      const outerTop = outer.getBoundingClientRect().top + window.scrollY;
      const scrolled = window.scrollY - outerTop;
      const scrollable = getScrollable();

      // progresso 0..1
      const progress = Math.max(0, Math.min(1, scrolled / scrollable));

      // translação horizontal total = (panelCount - 1) * 100vw
      const maxTranslate = (panelCount - 1) * window.innerWidth;
      const translateX   = progress * maxTranslate;
      track.style.transform = `translateX(-${translateX}px)`;

      // painel ativo
      const activeIndex = Math.round(progress * (panelCount - 1));
      dots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));

      // barra de progresso
      if (progBar) progBar.style.width = (progress * 100) + '%';

      // mini-steps aparecem quando o painel 1 está visível
      if (activeIndex >= 1) {
        miniSteps.forEach((s, i) => {
          setTimeout(() => s.classList.add('in-view'), i * 150);
        });
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // estado inicial
  }

  /* ─── Parallax suave no hero ──────────────────────────────── */
  function initHeroParallax() {
    const blobs = document.querySelectorAll('.hero-blob');
    if (!blobs.length) return;

    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      blobs.forEach((b, i) => {
        const speed = 0.2 + i * 0.12;
        b.style.transform += ` translateY(${y * speed}px)`;
      });
    }, { passive: true });
  }

  /* ─── Inicialização ──────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initCursorTrail();
    initScrollReveal();
    initCounters();
    initStickyHorizontalScroll();
    // initNavbarScroll é chamado após os componentes serem injetados (ver abaixo)
    // Fallback: se a navbar já estiver no DOM (páginas sem components.js), inicializa agora
    if (document.querySelector('.navbar')) {
      initNavbarScroll();
    }
  });

  // Quando components.js injeta a navbar, inicializa o scroll effect
  document.addEventListener('components:loaded', () => {
    initNavbarScroll();
  });

})();
