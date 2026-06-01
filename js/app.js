// ============================================================
// HERO BUTTON - ПОКАЗ ОСНОВНОГО КОНТЕНТУ
// ============================================================
const discoverBtn = document.getElementById('discoverBtn');
const mainContent = document.getElementById('mainContent');

if (discoverBtn && mainContent) {
  discoverBtn.addEventListener('click', () => {
    mainContent.classList.remove('hidden');
    setTimeout(() => {
      mainContent.classList.add('visible');
    }, 50);
    discoverBtn.style.opacity = '0';
    setTimeout(() => {
      discoverBtn.style.display = 'none';
    }, 300);
    setTimeout(() => {
      mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  });
}

// ============================================================
// SCROLL REVEAL ANIMATIONS
// ============================================================
const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');

      if (entry.target.classList.contains('gallery-wave')) {
        const items = entry.target.querySelectorAll('.gallery-stack-item');
        items.forEach((item, index) => {
          setTimeout(() => {
            item.classList.add('animate-in');
          }, index * 100);
        });
      }

      if (entry.target.classList.contains('schedule-wave')) {
        const items = entry.target.querySelectorAll('.schedule-item');
        items.forEach((item, index) => {
          setTimeout(() => {
            item.classList.add('animate-in');
          }, index * 100);
        });
      }
    }
  });
}, observerOptions);

const sectionsToAnimate = [
  '.story-wave',
  '.gallery-wave',
  '.gifts-wave',
  '.dresscode-wave',
  '.schedule-wave',
  '.song-wave',
  '.location-wave',
  '.rsvp-wave',
  '.footer-wave'
];

sectionsToAnimate.forEach(selector => {
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => observer.observe(el));
});

// ============================================================
// SCROLL INDICATOR
// ============================================================
const scrollIndicator = document.querySelector('.scroll-indicator');
if (scrollIndicator) {
  scrollIndicator.addEventListener('click', () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth'
    });
  });
}

// ============================================================
// PARALLAX ЕФЕКТ ДЛЯ ХВИЛЬ
// ============================================================
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const waves = document.querySelectorAll('.wave-svg');
  waves.forEach(wave => {
    wave.style.transform = `translateY(${scrolled * 0.3}px)`;
  });
});

// ============================================================
// ПІСЕННИЙ БЛОК - ВІДКРИТТЯ
// ============================================================
const openSongBtn = document.getElementById('openSongBtn');
const songContent = document.getElementById('songContent');

if (openSongBtn && songContent) {
  openSongBtn.addEventListener('click', () => {
    songContent.classList.toggle('open');
    openSongBtn.classList.toggle('open');

    const isOpen = songContent.classList.contains('open');
    if (isOpen) {
      openSongBtn.innerHTML = `
        <span class="song-btn-icon">🎤</span>
        <span>Співаємо разом!</span>
        <span class="song-arrow">▲</span>
      `;
    } else {
      openSongBtn.innerHTML = `
        <span class="song-btn-icon">📖</span>
        <span>Відкрити слова пісні</span>
        <span class="song-arrow">▼</span>
      `;
    }
  });
}

// ============================================================
// GALLERY LIGHTBOX
// ============================================================
const lightbox = document.getElementById('lightboxSimple');
const lightboxImg = document.getElementById('lightboxImgSimple');
const lightboxCaption = document.getElementById('lightboxCaptionSimple');
const closeBtn = document.querySelector('.lightbox-close-simple');
const galleryItems = document.querySelectorAll('.gallery-stack-item');

function openLightbox(src, caption) {
  if (lightboxImg) lightboxImg.src = src;
  if (lightboxCaption) lightboxCaption.textContent = caption;
  if (lightbox) lightbox.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (lightbox) lightbox.classList.remove('show');
  document.body.style.overflow = '';
}

galleryItems.forEach(item => {
  const img = item.querySelector('img');
  const caption = item.querySelector('.stack-caption')?.textContent || 'Фото';
  if (img) {
    item.addEventListener('click', () => openLightbox(img.src, caption));
  }
});

if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
if (lightbox) {
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox?.classList.contains('show')) closeLightbox();
});

// ============================================================
// RSVP LOGIC
// ============================================================
let attendingSimple = true;

const yesSimple = document.getElementById('yesSimple');
const noSimple = document.getElementById('noSimple');
const guestsDiv = document.getElementById('guestsSimple');
const dietDiv = document.getElementById('dietSimple');
const submitSimple = document.getElementById('submitSimple');
const rsvpFormSimple = document.getElementById('rsvpFormSimple');
const successSimple = document.getElementById('successSimple');

function setAttendanceSimple(value) {
  attendingSimple = value;
  if (yesSimple && noSimple) {
    yesSimple.classList.toggle('active', value);
    noSimple.classList.toggle('active', !value);
  }
  if (guestsDiv) guestsDiv.style.display = value ? 'block' : 'none';
  if (dietDiv) dietDiv.style.display = value ? 'block' : 'none';
}

if (yesSimple) yesSimple.addEventListener('click', () => setAttendanceSimple(true));
if (noSimple) noSimple.addEventListener('click', () => setAttendanceSimple(false));

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${isError ? '#e74c3c' : '#27ae60'};
    color: white;
    padding: 12px 24px;
    border-radius: 50px;
    font-size: 14px;
    z-index: 9999;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    font-family: 'Quicksand', sans-serif;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Додаємо стилі для анімації
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyPS6CSWe-RNqxOm8q7pxuD1iOM_CgFsSFloxbEnhyi8UYdvaAuBbz71OGHNecI-2c4jw/exec';

async function sendToGoogleSheets(data) {
  try {
    await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(data)
    });
    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}

async function submitRSVP() {
  const name = document.getElementById('nameSimple')?.value.trim();
  if (!name) {
    showNotification('Будь ласка, введіть ваше ім\'я', true);
    return;
  }

  const rsvpData = {
    timestamp: new Date().toLocaleString('uk-UA'),
    name: name,
    attending: attendingSimple ? 'Так' : 'Ні',
    guestCount: attendingSimple ? (document.getElementById('countSimple')?.value || '') : '',
    diet: attendingSimple ? (document.getElementById('dietSimpleInput')?.value || '') : '',
    phone: document.getElementById('phoneSimple')?.value || '',
    wishes: document.getElementById('wishesSimple')?.value || ''
  };

  await sendToGoogleSheets(rsvpData);

  if (rsvpFormSimple) rsvpFormSimple.style.display = 'none';
  if (successSimple) successSimple.classList.add('show');
  showNotification('Дякуємо! Вашу відповідь отримано 💕');
}

if (submitSimple) submitSimple.addEventListener('click', submitRSVP);
setAttendanceSimple(true);

// ============================================================
// BACKGROUND MUSIC (використання існуючого аудіо)
// ============================================================
(function initBackgroundMusic() {
  // Отримуємо існуючий аудіо-елемент
  const audioElement = document.getElementById('bgMusic');
  if (!audioElement) {
    console.warn('Аудіо елемент не знайдено');
    return;
  }

  let isMusicStarted = false;
  let musicControlBtn = null;

  // Створюємо кнопку керування (якщо її немає)
  function createMusicControls() {
    // Перевіряємо, чи вже є кнопка
    if (document.querySelector('.music-control')) return;

    const controlDiv = document.createElement('div');
    controlDiv.className = 'music-control';
    controlDiv.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;

    musicControlBtn = document.createElement('button');
    musicControlBtn.className = 'music-btn';
    musicControlBtn.innerHTML = '🎵 Музика вимкнена';
    musicControlBtn.style.cssText = `
      background: rgba(232, 168, 124, 0.9);
      border: none;
      color: white;
      padding: 10px 20px;
      border-radius: 50px;
      font-size: 14px;
      cursor: pointer;
      backdrop-filter: blur(5px);
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.3s;
      font-family: 'Quicksand', sans-serif;
      pointer-events: auto;
    `;
    musicControlBtn.onmouseenter = () => musicControlBtn.style.transform = 'scale(1.05)';
    musicControlBtn.onmouseleave = () => musicControlBtn.style.transform = 'scale(1)';

    controlDiv.appendChild(musicControlBtn);
    document.body.appendChild(controlDiv);

    // Обробник для кнопки
    musicControlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audioElement.paused) {
        audioElement.play().catch(err => console.log('Помилка відтворення:', err));
        musicControlBtn.innerHTML = '🎵 Музика грає';
      } else {
        audioElement.pause();
        musicControlBtn.innerHTML = '🎵 Музика вимкнена';
      }
    });
  }

  // Функція запуску музики
  function startMusic() {
    if (!isMusicStarted) {
      audioElement.play().then(() => {
        isMusicStarted = true;
        if (musicControlBtn) musicControlBtn.innerHTML = '🎵';
        // Показати кнопку керування
        const controlDiv = document.querySelector('.music-control');
        if (controlDiv) controlDiv.style.opacity = '1';
      }).catch(err => {
        console.log('Автовідтворення заблоковане, потрібен клік користувача');
        if (musicControlBtn) musicControlBtn.innerHTML = '🎵 Увімкнути музику';
        const controlDiv = document.querySelector('.music-control');
        if (controlDiv) controlDiv.style.opacity = '1';
      });
    }
  }

  // Створюємо кнопку управління (приховану спочатку)
  createMusicControls();

  // Додаємо запуск музики на кнопку "Відкрити запрошення"
  const discoverBtn = document.getElementById('discoverBtn');
  if (discoverBtn) {
    discoverBtn.addEventListener('click', startMusic, { once: true });
  } else {
    // Якщо кнопки немає, запускаємо після першого кліку по сторінці
    document.body.addEventListener('click', function firstClick() {
      startMusic();
      document.body.removeEventListener('click', firstClick);
    });
  }

  // Якщо контент вже видимий (наприклад, після перезавантаження), запускаємо музику одразу
  if (mainContent && !mainContent.classList.contains('hidden')) {
    startMusic();
  }
})();
