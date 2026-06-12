// ============================================================
// Весільне запрошення – музика після кліку, кнопка з анімацією
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  const discoverBtnForm = document.getElementById('discoverBtnForm');
  const mainContent = document.getElementById('mainContent');
  const audio = document.getElementById('bgMusic');
  let musicStarted = false;
  let musicControlDiv = null;
  let musicControlBtn = null;

  // Функція запуску музики (змінює іконку та додає анімацію)
  function startMusic() {
    if (!musicStarted && audio) {
      audio.volume = 0.45;
      audio.play().then(() => {
        musicStarted = true;
        if (musicControlBtn) {
          musicControlBtn.innerHTML = '🎶'; // ноти, що грають
          musicControlBtn.classList.add('playing');
        }
      }).catch(() => {
        console.log('Автовідтворення заблоковано');
        if (musicControlBtn) {
          musicControlBtn.innerHTML = '🎵';
          musicControlBtn.classList.remove('playing');
        }
      });
    }
  }

  // Створення кнопки керування (спочатку прихована)
  function createMusicControl() {
    if (document.querySelector('.music-control')) return;
    const div = document.createElement('div');
    div.className = 'music-control';
    div.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 1000;
      opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
    `;
    musicControlBtn = document.createElement('button');
    musicControlBtn.className = 'music-btn';
    musicControlBtn.innerHTML = '🎵'; // початкова іконка
    musicControlBtn.style.cssText = `
      background: #9B6F5F; border: none; color: white;
      width: 50px; height: 50px; border-radius: 50%; font-size: 24px;
      cursor: pointer; backdrop-filter: blur(5px); box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.3s; font-family: "Cormorant", serif; pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
    `;
    musicControlBtn.onmouseenter = () => musicControlBtn.style.transform = 'scale(1.05)';
    musicControlBtn.onmouseleave = () => musicControlBtn.style.transform = 'scale(1)';
    musicControlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audio.paused) {
        audio.play().catch(err => console.log('Помилка відтворення:', err));
        musicControlBtn.innerHTML = '🎶';
        musicControlBtn.classList.add('playing');
        musicStarted = true;
      } else {
        audio.pause();
        musicControlBtn.innerHTML = '🎵';
        musicControlBtn.classList.remove('playing');
      }
    });
    div.appendChild(musicControlBtn);
    document.body.appendChild(div);
    musicControlDiv = div;
  }

  // Показати кнопку керування
  function showMusicControl() {
    if (musicControlDiv) {
      musicControlDiv.style.opacity = '1';
      musicControlDiv.style.pointerEvents = 'auto';
    }
  }

  createMusicControl();

  // ===== 1. КНОПКА "ВІДКРИТИ ФОРМУ" =====
  if (discoverBtnForm && mainContent) {
    discoverBtnForm.addEventListener('click', function(e) {
      e.preventDefault();
      startMusic();
      showMusicControl();

      if (mainContent.classList.contains('hidden')) {
        mainContent.classList.remove('hidden');
      }

      const allSections = mainContent.querySelectorAll('section');
      allSections.forEach(section => {
        if (section.classList.contains('rsvp-wave')) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      });

      const rsvpSection = document.querySelector('.rsvp-wave');
      if (rsvpSection) {
        setTimeout(() => {
          rsvpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }

      discoverBtnForm.style.transform = 'scale(0.98)';
      setTimeout(() => { discoverBtnForm.style.transform = ''; }, 150);
    });
  }

  // ===== 2. ЛОГІКА RSVP (відправка форми) – БЕЗ ЗЕЛЕНОГО БЛОКУ =====
  (function initRSVP() {
    let attendingSimple = true;
    let isSubmitting = false;
    const yesSimple = document.getElementById('yesSimple');
    const noSimple = document.getElementById('noSimple');
    const guestsDiv = document.getElementById('guestsSimple');
    const drinkDiv = document.getElementById('drinkSimple');
    const submitBtn = document.getElementById('submitSimple');
    const rsvpForm = document.getElementById('rsvpFormSimple');
    // successDiv більше не використовується

    function setAttendance(value) {
      attendingSimple = value;
      if (yesSimple && noSimple) {
        yesSimple.classList.toggle('active', value);
        noSimple.classList.toggle('active', !value);
      }
      if (guestsDiv) guestsDiv.style.display = value ? 'block' : 'none';
      if (drinkDiv) drinkDiv.style.display = value ? 'block' : 'none';
    }

    if (yesSimple) yesSimple.addEventListener('click', () => setAttendance(true));
    if (noSimple) noSimple.addEventListener('click', () => setAttendance(false));

    function showNotification(msg, isError = false) {
      const notif = document.createElement('div');
      notif.textContent = msg;
      notif.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${isError ? '#e74c3c' : '#27ae60'}; color: white;
        padding: 12px 24px; border-radius: 50px; z-index: 9999;
        font-family: 'Quicksand', sans-serif;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 10000;
      `;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 3000);
    }

    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxQoK5QII48AF3bLHVaDCqfXeMgCOaTGyp_sb7NznjQx4PWWgTdbnrs__w8oOcNL6Xklg/exec';

    async function sendToSheets(data) {
      try {
        await fetch(WEB_APP_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return true;
      } catch (err) {
        console.error('Fetch error:', err);
        return false;
      }
    }

    async function submitRSVP(e) {
      if (e) e.preventDefault();
      if (isSubmitting) {
        showNotification('Зачекайте, попередній запит ще виконується...', true);
        return;
      }
      isSubmitting = true;

      const nameInput = document.getElementById('nameSimple');
      const name = nameInput?.value.trim();
      if (!name) {
        showNotification('Будь ласка, введіть ваше ім\'я', true);
        isSubmitting = false;
        return;
      }

      let drinkValue = '';
      if (attendingSimple) {
        const drinkSelect = document.getElementById('drinkSelect');
        if (drinkSelect) drinkValue = drinkSelect.value;
        if (!drinkValue) {
          showNotification('Будь ласка, оберіть напій 🍷', true);
          isSubmitting = false;
          return;
        }
      }

      const guestCount = attendingSimple ? (document.getElementById('countSimple')?.value || '') : '';
      const wishes = document.getElementById('wishesSimple')?.value || '';

      const rsvpData = {
        timestamp: new Date().toLocaleString('uk-UA'),
        name: name,
        attending: attendingSimple ? 'Так' : 'Ні',
        guestCount: guestCount,
        drink: drinkValue,
        wishes: wishes
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Відправляється...';
      }

      await sendToSheets(rsvpData);

      // Приховуємо форму, але не показуємо зелений блок
      if (rsvpForm) rsvpForm.style.display = 'none';
      // Повідомлення-тост залишається для зворотного зв'язку
      // showNotification('Дякуємо! Вашу відповідь отримано 💕');
      isSubmitting = false;
    }

    if (submitBtn) {
      const newBtn = submitBtn.cloneNode(true);
      submitBtn.parentNode.replaceChild(newBtn, submitBtn);
      newBtn.addEventListener('click', submitRSVP);
    }

    setAttendance(true);
  })();

  // ===== 3. ПІСЕННИЙ БЛОК =====
  const openSongBtn = document.getElementById('openSongBtn');
  const songContent = document.getElementById('songContent');
  if (openSongBtn && songContent) {
    openSongBtn.addEventListener('click', () => {
      songContent.classList.toggle('open');
      const isOpen = songContent.classList.contains('open');
      openSongBtn.innerHTML = isOpen
        ? `<span class="song-btn-icon">🎤</span><span>Співаємо разом!</span><span class="song-arrow">▲</span>`
        : `<span class="song-btn-icon">📖</span><span>Відкрити слова пісні</span><span class="song-arrow">▼</span>`;
    });
    songContent.classList.remove('open');
  }

  // ===== 4. ПАРАЛАКС ДЛЯ ХВИЛЬ =====
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const waves = document.querySelectorAll('.wave-svg');
    waves.forEach(wave => {
      wave.style.transform = `translateY(${scrolled * 0.3}px)`;
    });
  });
});
