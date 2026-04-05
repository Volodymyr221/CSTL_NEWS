import { showToast } from '../core/utils.js';

export function initSubmit() {
  const form = document.getElementById('submit-form');
  if (!form) return;
  form.addEventListener('submit', handleSubmit);
}

function handleSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('submit-name').value.trim();
  const contact = document.getElementById('submit-contact').value.trim();
  const text = document.getElementById('submit-text').value.trim();

  if (!text) {
    showToast('Опишіть новину або вставте посилання');
    return;
  }

  // Формуємо посилання на mailto (відправка на пошту редакції)
  // В майбутньому можна замінити на API запит
  const subject = encodeURIComponent('Пропозиція новини — CSTL NEWS');
  const body = encodeURIComponent(
    `Від: ${name || 'Анонімно'}\nКонтакт: ${contact || 'не вказано'}\n\n${text}`
  );

  // Зберігаємо в localStorage як fallback (резервний варіант)
  const submissions = JSON.parse(localStorage.getItem('cstl_submissions') || '[]');
  submissions.push({ name, contact, text, ts: Date.now() });
  localStorage.setItem('cstl_submissions', JSON.stringify(submissions));

  // Відкриваємо email клієнт
  window.location.href = `mailto:cstlnews@gmail.com?subject=${subject}&body=${body}`;

  showToast('Дякуємо! Ваша новина надіслана редакції.');

  document.getElementById('submit-form').reset();
}
