// ============================================================
// Весільне запрошення – повна логіка (сплеш, форма, музика, кнопка "Назад")
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // ------ ЕЛЕМЕНТИ ------
  const splash = document.getElementById('splashScreen');
  const mainPage = document.getElementById('mainPage');
  const discoverBtnForm = document.getElementById('discoverBtnForm');
  const mainContent = document.getElementById('mainContent');
  const backBtn = document.getElementById('backToSplashBtn');
  const audio = document.getElementById('bgMusic');
  let musicPlayed = false;
  let isFormVisible = false; // чи відкрита форма

  // ------ ФУНКЦІЯ ЗАПУСКУ МУЗИКИ ------
  function startMusic() {
    if (!musicPlayed && audio) {
      audio.volume = 0.45;
      audio.play().catch(() => console.log('Автовідтворення заблоковано'));
      musicPlayed = true;
    }
  }

  // ------ ФУНКЦІЯ СКИДАННЯ СТАНУ MAINCONTENT (показуємо всі секції) ------
  function resetMainContentDisplay() {
    if (!mainContent) return;
    const sections = mainContent.querySelectorAll('section');
    sections.forEach(section => {
      section.style.display = '';          // видаляємо inline display
      section.classList.remove('future-hidden');
    });
    isFormVisible = false;
  }

  // ===== 1. СПЛЕШ: кнопка "Підтвердити" =====
  const splashBtn = document.getElementById('splashOpenBtn');
  if (splashBtn && splash && mainPage) {
    splashBtn.addEventListener('click', function(e) {
      e.preventDefault();
      startMusic();

      // Ховаємо сплеш
      splash.classList.add('hide-splash');
      splash.style.display = 'none';
      // Показуємо головну сторінку
      mainPage.classList.add('visible');
      mainPage.style.display = 'block';
      // Скидаємо стан всіх секцій (показуємо всі)
      resetMainContentDisplay();
      // Прокручуємо вгору
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== 2. КНОПКА "ВІДКРИТИ ФОРМУ" (показуємо тільки секцію RSVP) =====
  if (discoverBtnForm && mainContent) {
    discoverBtnForm.addEventListener('click', function(e) {
      e.preventDefault();
      startMusic();

      // Якщо форма вже видима, просто прокручуємо
      if (isFormVisible) {
        const rsvpSection = document.querySelector('.rsvp-wave');
        if (rsvpSection) rsvpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // Робимо mainContent видимим (на всяк випадок)
      if (mainContent.classList.contains('hidden')) {
        mainContent.classList.remove('hidden');
      }

      // Приховуємо всі секції, крім .rsvp-wave
      const allSections = mainContent.querySelectorAll('section');
      allSections.forEach(section => {
        if (section.classList.contains('rsvp-wave')) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      });
      isFormVisible = true;

      // Прокручуємо до форми
      const rsvpSection = document.querySelector('.rsvp-wave');
      if (rsvpSection) {
        setTimeout(() => {
          rsvpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }

      // Анімація кнопки
      discoverBtnForm.style.transform = 'scale(0.98)';
      setTimeout(() => { discoverBtnForm.style.transform = ''; }, 150);
    });
  }

  // ===== 3. КНОПКА "НАЗАД" (стрілка) – повернення до сплешу =====
  if (backBtn && splash && mainPage) {
    backBtn.addEventListener('click', function(e) {
      e.preventDefault();

      // Зупиняємо музику і скидаємо прапорець
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        musicPlayed = false;
        const musicCtrl = document.querySelector('.music-btn');
        if (musicCtrl) musicCtrl.innerHTML = '🎵 Увімкнути музику';
      }

      // Ховаємо основний контент
      mainPage.style.display = 'none';
      mainPage.classList.remove('visible');
      if (mainContent) mainContent.classList.add('hidden');

      // Показуємо сплеш
      splash.classList.remove('hide-splash');
      splash.style.display = 'flex';

      // Прокручуємо вгору
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== 4. ЛОГІКА RSVP (відправка форми) =====
  (function initRSVP() {
    let attendingSimple = true;
    let isSubmitting = false;
    const yesSimple = document.getElementById('yesSimple');
    const noSimple = document.getElementById('noSimple');
    const guestsDiv = document.getElementById('guestsSimple');
    const drinkDiv = document.getElementById('drinkSimple');
    const submitBtn = document.getElementById('submitSimple');
    const rsvpForm = document.getElementById('rsvpFormSimple');
    const successDiv = document.getElementById('successSimple');

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

      if (rsvpForm) rsvpForm.style.display = 'none';
      if (successDiv) successDiv.style.display = 'block';
      showNotification('Дякуємо! Вашу відповідь отримано 💕');
      isSubmitting = false;
    }

    if (submitBtn) {
      const newBtn = submitBtn.cloneNode(true);
      submitBtn.parentNode.replaceChild(newBtn, submitBtn);
      newBtn.addEventListener('click', submitRSVP);
    }

    setAttendance(true);
  })();

  // ===== 5. ПІСЕННИЙ БЛОК =====
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

  // ===== 6. ПАРАЛАКС ДЛЯ ХВИЛЬ =====
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const waves = document.querySelectorAll('.wave-svg');
    waves.forEach(wave => {
      wave.style.transform = `translateY(${scrolled * 0.3}px)`;
    });
  });

  // ===== 7. КНОПКА КЕРУВАННЯ МУЗИКОЮ =====
  (function initMusicControl() {
    if (!audio) return;
    let musicControlBtn = null;

    function createControl() {
      if (document.querySelector('.music-control')) return;
      const div = document.createElement('div');
      div.className = 'music-control';
      div.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 1000;
        opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
      `;
      musicControlBtn = document.createElement('button');
      musicControlBtn.className = 'music-btn';
      musicControlBtn.innerHTML = '🎵 Додати музику/Вимкнути музику';
      musicControlBtn.style.cssText = `
        background: rgba(232, 168, 124, 0.9); border: none; color: white;
        padding: 10px 20px; border-radius: 50px; font-size: 14px;
        cursor: pointer; backdrop-filter: blur(5px); box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: all 0.3s; font-family: 'Quicksand', sans-serif; pointer-events: auto;
      `;
      musicControlBtn.onmouseenter = () => musicControlBtn.style.transform = 'scale(1.05)';
      musicControlBtn.onmouseleave = () => musicControlBtn.style.transform = 'scale(1)';
      musicControlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (audio.paused) {
          audio.play().catch(err => console.log('Помилка відтворення:', err));
          musicControlBtn.innerHTML = '🎵 Додати музику/Вимкнути музику';
          musicPlayed = true;
        } else {
          audio.pause();
          musicControlBtn.innerHTML = '🎵 Додати музику/Вимкнути музику';
        }
      });
      div.appendChild(musicControlBtn);
      document.body.appendChild(div);
    }

    createControl();
    setTimeout(() => {
      const ctrl = document.querySelector('.music-control');
      if (ctrl) ctrl.style.opacity = '1';
    }, 1000);
  })();
});
