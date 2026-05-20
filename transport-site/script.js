// ВантажХаб — interactivity (mobile menu, form, scroll reveal)

(() => {
  'use strict';

  // ── Mobile menu (бургер-меню для мобільних) ──
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('.nav-main');
  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ── Phone input mask (маска для українського телефону) ──
  const phone = document.getElementById('f-phone');
  if (phone) {
    phone.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.startsWith('380')) v = v.slice(3);
      if (v.startsWith('0')) v = v.slice(1);
      v = v.slice(0, 9);
      let out = '+380';
      if (v.length > 0) out += ' ' + v.slice(0, 2);
      if (v.length > 2) out += ' ' + v.slice(2, 5);
      if (v.length > 5) out += ' ' + v.slice(5, 7);
      if (v.length > 7) out += ' ' + v.slice(7, 9);
      e.target.value = out;
    });
  }

  // ── Form submit (заявка — імітація, без backend) ──
  const form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.querySelector('#f-name').value.trim();
      const tel = form.querySelector('#f-phone').value.trim();
      if (!name || tel.replace(/\D/g, '').length < 12) {
        alert('Заповніть, будь ласка, ім\'я та коректний номер телефону.');
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Надсилаємо...';
      // Імітація відправки. Реальний endpoint підключається тут.
      setTimeout(() => {
        const ok = form.querySelector('.form-success');
        if (ok) ok.hidden = false;
        form.querySelectorAll('input, textarea').forEach(el => { el.value = ''; el.disabled = true; });
        btn.style.display = 'none';
      }, 700);
    });
  }

  // ── Scroll reveal (плавна поява секцій при прокручуванні) ──
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.style.opacity = '1';
          en.target.style.transform = 'translateY(0)';
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.service-card, .fleet-card, .why-card, .routes-col').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = `opacity .6s ease ${i * 60}ms, transform .6s ease ${i * 60}ms`;
      io.observe(el);
    });
  }

  // ── Animated counter for hero stats (анімований лічильник цифр) ──
  const statNumbers = document.querySelectorAll('.hero-stats strong');
  const animate = (el) => {
    const text = el.textContent;
    const num = parseInt(text.replace(/\D/g, ''), 10);
    if (!num || num > 100000) return;
    const suffix = text.replace(/[\d\s]/g, '');
    const prefix = text.startsWith('+') ? '+' : '';
    let cur = 0;
    const step = Math.max(1, Math.floor(num / 30));
    const t = setInterval(() => {
      cur += step;
      if (cur >= num) { cur = num; clearInterval(t); }
      el.textContent = prefix + cur.toLocaleString('uk') + suffix;
    }, 30);
  };
  if ('IntersectionObserver' in window && statNumbers.length) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          animate(en.target);
          so.unobserve(en.target);
        }
      });
    }, { threshold: 0.5 });
    statNumbers.forEach(el => so.observe(el));
  }

  // ── Header shadow on scroll (тінь хедера при прокручуванні) ──
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => {
      header.style.boxShadow = window.scrollY > 8
        ? '0 8px 24px -12px rgba(0,0,0,.5)'
        : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
