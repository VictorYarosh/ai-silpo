// ============================================================
// Весільне запрошення – показуємо ТІЛЬКИ форму (rsvp-wave)
// Решта контенту (story, gifts, dresscode, schedule, song, location)
// залишаються прихованими в mainContent для майбутнього використання
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Елементи
  const splash = document.getElementById('splashScreen');
  const mainPage = document.getElementById('mainPage');
  const discoverBtnForm = document.getElementById('discoverBtnForm');
  const mainContent = document.getElementById('mainContent');
  const audio = document.getElementById('bgMusic');
  let musicPlayed = false;

  // Функція запуску музики
  function playMusic() {
    if (!musicPlayed && audio) {
      audio.volume = 0.45;
      audio.play().catch(() => console.log("autoplay заблоковано"));
      musicPlayed = true;
    }
  }

  // 1. Splash -> показуємо головну сторінку (hero)
  const splashBtn = document.getElementById('splashOpenBtn');
  if (splashBtn) {
    splashBtn.addEventListener('click', function(e) {
      e.preventDefault();
      playMusic();
      splash.classList.add('hide-splash');
      setTimeout(() => {
        splash.style.display = 'none';
        mainPage.classList.add('visible');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 800);
    });
  }

  // 2. Кнопка "Відкрити форму"
  if (discoverBtnForm && mainContent) {
    discoverBtnForm.addEventListener('click', function(e) {
      e.preventDefault();
      playMusic();

      // Робимо mainContent видимим (знімаємо клас hidden)
      if (mainContent.classList.contains('hidden')) {
        mainContent.classList.remove('hidden');
      }

      // Ховаємо всі секції в mainContent, КРІМ .rsvp-wave
      const allSections = mainContent.querySelectorAll('section');
      allSections.forEach(section => {
        if (!section.classList.contains('rsvp-wave')) {
          section.classList.add('future-hidden');
        } else {
          // Переконуємось, що форма не має класу future-hidden
          section.classList.remove('future-hidden');
        }
      });

      // Прокручуємо до форми
      const rsvpSection = document.querySelector('.rsvp-wave');
      if (rsvpSection) {
        setTimeout(() => {
          rsvpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }

      // Анімація кнопки
      discoverBtnForm.style.transform = 'scale(0.98)';
      setTimeout(() => { discoverBtnForm.style.transform = ''; }, 150);
    });
  }

  // 3. Логіка RSVP (відправка форми, валідація)
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

  // 4. Пісенний блок (лише якщо він стане видимим у майбутньому)
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

  // 5. Паралакс для хвиль
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const waves = document.querySelectorAll('.wave-svg');
    waves.forEach(wave => {
      wave.style.transform = `translateY(${scrolled * 0.3}px)`;
    });
  });

  // 6. Фонова музика – кнопка керування
  (function initBackgroundMusic() {
    if (!audio) return;
    let isMusicStarted = false;
    let musicControlBtn = null;

    function createMusicControls() {
      if (document.querySelector('.music-control')) return;
      const controlDiv = document.createElement('div');
      controlDiv.className = 'music-control';
      controlDiv.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 1000;
        opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
      `;
      musicControlBtn = document.createElement('button');
      musicControlBtn.className = 'music-btn';
      musicControlBtn.innerHTML = '🎵 Музика вимкнена';
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
          musicControlBtn.innerHTML = '🎵 Музика грає';
        } else {
          audio.pause();
          musicControlBtn.innerHTML = '🎵 Музика вимкнена';
        }
      });
      controlDiv.appendChild(musicControlBtn);
      document.body.appendChild(controlDiv);
    }

    function startMusic() {
      if (!isMusicStarted) {
        audio.play().then(() => {
          isMusicStarted = true;
          if (musicControlBtn) musicControlBtn.innerHTML = '🎵 Музика грає';
          const controlDiv = document.querySelector('.music-control');
          if (controlDiv) controlDiv.style.opacity = '1';
        }).catch(() => {
          console.log('Автовідтворення заблоковане, потрібен клік користувача');
          if (musicControlBtn) musicControlBtn.innerHTML = '🎵 Увімкнути музику';
          const controlDiv = document.querySelector('.music-control');
          if (controlDiv) controlDiv.style.opacity = '1';
        });
      }
    }

    createMusicControls();

    // Музика стартує при першому кліку на кнопку "Відкрити форму"
    if (discoverBtnForm) {
      discoverBtnForm.addEventListener('click', startMusic, { once: true });
    } else {
      document.body.addEventListener('click', function firstClick() {
        startMusic();
        document.body.removeEventListener('click', firstClick);
      });
    }
  })();
});
