// src/tabs/community-modal.js
// Bottom-sheet модалка «Подати оголошення» — викликається кнопкою у дошці громади.
// Створює оверлей через append у body, прибирає при close.
// Submit-handler наразі заглушка (Фаза 3 → Supabase POST у community_posts).

import { showToast } from '../core/utils.js';

export function openBoardModal() {
  if (document.getElementById('cm-board-modal')) return; // вже відкрита

  const wrap = document.createElement('div');
  wrap.id = 'cm-board-modal';
  wrap.className = 'cm-board-modal';
  wrap.innerHTML = `
    <div class="cm-board-modal-backdrop"></div>
    <div class="cm-board-modal-panel" role="dialog" aria-modal="true">
      <div class="cm-board-modal-handle"></div>
      <button class="cm-board-modal-close" type="button" aria-label="Закрити">✕</button>
      <h3 class="cm-board-modal-title">✏️ Подати оголошення</h3>
      <p class="cm-board-modal-sub">Оголошення, подія або новина — модератор обере куди опублікувати.</p>
      <form id="cm-board-modal-form">
        <textarea class="cm-board-input" id="cm-board-text" placeholder="Що хочете повідомити громаді? (продам, шукаю, подяка, подія…)" rows="4" required></textarea>
        <input class="cm-board-input cm-board-input--small" id="cm-board-author" type="text" placeholder="Імʼя (або залиште порожнім — анонімно)">
        <input class="cm-board-input cm-board-input--small" id="cm-board-contact" type="text" placeholder="Контакт: телефон / Telegram (необовʼязково)">
        <button class="cm-board-submit" type="submit">Надіслати →</button>
        <p class="cm-board-hint">Запит йде модератору. Після перевірки оголошення зʼявиться на дошці, у новинах або в подіях.</p>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));
  setTimeout(() => wrap.querySelector('#cm-board-text')?.focus(), 200);

  function close() {
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 220);
  }

  wrap.querySelector('.cm-board-modal-backdrop')?.addEventListener('click', close);
  wrap.querySelector('.cm-board-modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  });

  wrap.querySelector('#cm-board-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = wrap.querySelector('#cm-board-text')?.value.trim();
    if (!text) return;
    // TODO Supabase (Фаза 3): POST у таблицю community_posts зі статусом 'pending'.
    close();
    showToast('Дякуємо! Запит надіслано модератору.', 4000);
  });
}
