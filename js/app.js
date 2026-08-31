// ============================================================
// 1. ДАНІ ПРО МАГАЗИН (Воскресенський просп., 36)
// ============================================================
const storeData = {
  zones: [{
    id: 'vegetables',
    icon: '🥬',
    name: 'Овочі & Фрукти',
    color: 'zone-vegetables',
    items: ['помідори', 'огірки', 'картопля', 'цибуля', 'морква', 'капуста', 'яблука', 'банани', 'апельсини', 'лимони']
  }, {
    id: 'dairy',
    icon: '🥛',
    name: 'Молочка & Сири',
    color: 'zone-dairy',
    items: ['молоко', 'кефір', 'йогурт', 'сметана', 'сир', 'масло', 'вершки', 'ряжанка', 'сир кисломолочний', 'моцарелла']
  }, {
    id: 'meat',
    icon: '🥩',
    name: "М'ясо & Ковбаси",
    color: 'zone-meat',
    items: ['ковбаса', 'сосиски', 'сало', 'фарш', 'курятина', 'свинина', 'яловичина', 'бекон', 'шинка', 'ковбаса варена']
  }, {
    id: 'drinks',
    icon: '🥤',
    name: 'Напої & Соки',
    color: 'zone-drinks',
    items: ['вода', 'сік', 'кола', 'лимонад', 'квас', 'мінеральна вода', 'газована вода', 'морс', 'компот', 'енергетик']
  }, {
    id: 'bakery',
    icon: '🍞',
    name: 'Хліб & Випічка',
    color: 'zone-bakery',
    items: ['хліб', 'батон', 'булка', 'круасан', 'пиріжок', 'пампушка', 'багет', 'житній хліб', 'плюшка', 'ватрушка']
  }, {
    id: 'grocery',
    icon: '🍚',
    name: 'Бакалія & Крупи',
    color: 'zone-grocery',
    items: ['рис', 'гречка', 'макарони', 'борошно', 'цукор', 'сіль', 'перець', 'крупи', 'пшоно', 'вівсянка']
  }, {
    id: 'sauces',
    icon: '🌶️',
    name: 'Соуси & Пасти',
    color: 'zone-sauces',
    items: ['кетчуп', 'майонез', 'паста', 'томатна паста', 'соєвий соус', 'гірчиця', 'хрін', 'аджика', 'песто',
      'оливкова олія'
    ]
  }, {
    id: 'sweets',
    icon: '🍫',
    name: 'Солодощі & Печиво',
    color: 'zone-sweets',
    items: ['печиво', 'цукерки', 'шоколад', 'зефір', 'мармелад', 'вафлі', 'пряники', 'халва', 'батончики', 'льодяники']
  }]
};

// Відстані між зонами (в метрах, для демонстрації)
const zoneDistances = {
  'vegetables': 0,
  'dairy': 12,
  'meat': 8,
  'drinks': 10,
  'bakery': 6,
  'grocery': 14,
  'sauces': 9,
  'sweets': 11
};

// ============================================================
// 2. ЕМУЛЯЦІЯ MCP ЗАПИТУ
// ============================================================
function mockMCPRequest(query) {
  const lowerQuery = query.toLowerCase().trim();
  let foundZone = null;
  let foundItem = null;
  let matchType = 'exact';

  // Точний пошук
  for (const zone of storeData.zones) {
    for (const item of zone.items) {
      if (item === lowerQuery) {
        foundZone = zone;
        foundItem = item;
        matchType = 'exact';
        break;
      }
    }
    if (foundZone) break;
  }

  // Пошук за частковим збігом
  if (!foundZone) {
    for (const zone of storeData.zones) {
      for (const item of zone.items) {
        if (item.includes(lowerQuery) || lowerQuery.includes(item)) {
          foundZone = zone;
          foundItem = item;
          matchType = 'partial';
          break;
        }
      }
      if (foundZone) break;
    }
  }

  if (!foundZone) {
    return null;
  }

  return {
    productId: `p-${Date.now()}`,
    productName: foundItem.charAt(0).toUpperCase() + foundItem.slice(1),
    zoneId: foundZone.id,
    zoneName: foundZone.name,
    zoneIcon: foundZone.icon,
    companyId: 'silpo-ua',
    branchId: 'voskresensky-36',
    found: true,
    matchType: matchType,
    mcpTool: 'silpo_find_products_batch',
    mcpResponse: {
      items: [{
        id: `p-${Date.now()}`,
        name: foundItem.charAt(0).toUpperCase() + foundItem.slice(1),
        zone: foundZone.name,
        price: Math.round((Math.random() * 100 + 10) * 100) / 100,
        inStock: true
      }]
    }
  };
}

// ============================================================
// 3. ВІДОБРАЖЕННЯ КАРТИ
// ============================================================
function renderMap() {
  const grid = document.getElementById('mapGrid');
  grid.innerHTML = '';
  storeData.zones.forEach(zone => {
    const div = document.createElement('div');
    div.className = `zone ${zone.color}`;
    div.dataset.zoneId = zone.id;
    div.innerHTML = `
            <div class="icon">${zone.icon}</div>
            <div class="name">${zone.name}</div>
            <div class="items">${zone.items.slice(0, 5).join(', ')}...</div>
            <div class="found-marker">📍</div>
        `;
    grid.appendChild(div);
  });
}

// ============================================================
// 4. ПОКРАЩЕНИЙ МАРШРУТ З ВІЗУАЛЬНИМИ ЕФЕКТАМИ
// ============================================================
function showRoute(result) {
  const container = document.getElementById('routeContainer');
  const steps = document.getElementById('routeSteps');
  const info = document.getElementById('routeInfo');

  const zoneOrder = ['vegetables', 'dairy', 'meat', 'drinks', 'bakery', 'grocery', 'sauces', 'sweets'];
  const targetIndex = zoneOrder.indexOf(result.zoneId);

  let routeHtml = '';
  const stepsToShow = zoneOrder.slice(0, targetIndex + 1);
  let totalDistance = 0;

  stepsToShow.forEach((zoneId, index) => {
    const zone = storeData.zones.find(z => z.id === zoneId);
    if (!zone) return;

    const isTarget = zoneId === result.zoneId;
    const isPassed = index < stepsToShow.length - 1;

    // Додаємо відстань
    if (index > 0) {
      const prevZone = zoneOrder[index - 1];
      totalDistance += zoneDistances[zoneId] || 5;
    }

    routeHtml += `
            <div class="step ${isTarget ? 'highlight-step' : ''} ${isPassed ? 'passed-step' : ''}">
                <span class="step-number">${index + 1}</span>
                <span class="step-icon">${zone.icon}</span>
                ${zone.name}
                ${isTarget ? ' 🎯' : ''}
            </div>
        `;

    if (index < stepsToShow.length - 1) {
      routeHtml += `<span class="arrow">→</span>`;
    }
  });

  steps.innerHTML = routeHtml;

  // Інформація про маршрут з відстанню
  const totalZones = stepsToShow.length;
  const estimatedTime = Math.round(totalDistance / 20); // 20 м/хв - середня швидкість ходьби

  let difficultyText = '';
  if (totalZones <= 2) difficultyText = '🟢 Дуже близько';
  else if (totalZones <= 4) difficultyText = '🟡 Середня відстань';
  else if (totalZones <= 6) difficultyText = '🟠 Трохи далі';
  else difficultyText = '🔴 Глибше магазину';

  info.innerHTML = `
        <span>🚶 <strong>Маршрут до ${result.productName}</strong></span>
        <span>📍 <strong>${totalZones}</strong> відділів</span>
        <span>📏 <strong>~${totalDistance}</strong> метрів</span>
        <span>⏱️ ~<strong>${estimatedTime}</strong> хв</span>
        <span class="distance-badge">${difficultyText}</span>
    `;

  container.classList.add('active');

  // Плавна прокрутка до маршруту
  setTimeout(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
}

// ============================================================
// 5. ПОШУК ТА ВІДОБРАЖЕННЯ РЕЗУЛЬТАТУ
// ============================================================
function searchProduct() {
  const input = document.getElementById('searchInput');
  const query = input.value.trim();

  if (!query) {
    alert('Введіть назву товару!');
    return;
  }

  // Очищаємо попередні підсвітки
  document.querySelectorAll('.zone.highlight').forEach(el => el.classList.remove('highlight'));
  document.getElementById('routeContainer').classList.remove('active');
  document.getElementById('resultBox').classList.remove('active');

  const result = mockMCPRequest(query);

  if (!result) {
    const resultBox = document.getElementById('resultBox');
    const content = document.getElementById('resultContent');
    content.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:24px;">😕</span>
                <div>
                    <div class="product-name">Товар не знайдено</div>
                    <div style="color:#6b7a8a;">Спробуйте інший запит. Ми шукали: <strong>"${query}"</strong></div>
                    <div style="font-size:12px; color:#6b7a8a; margin-top:4px;">
                        💡 Доступні товари: молоко, хліб, ковбаса, шоколад, сир, яблука...
                    </div>
                </div>
            </div>
            <div class="mcp-call">
                ➜ MCP запит: silpo_find_products_batch({ query: "${query}" })<br>
                ➜ Відповідь: жодного товару не знайдено
            </div>
        `;
    resultBox.classList.add('active');
    return;
  }

  // Підсвічуємо зону з анімацією
  const zoneElement = document.querySelector(`.zone[data-zone-id="${result.zoneId}"]`);
  if (zoneElement) {
    zoneElement.classList.add('highlight');
    setTimeout(() => {
      zoneElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // Показуємо маршрут
  showRoute(result);

  // Показуємо результат
  const resultBox = document.getElementById('resultBox');
  const content = document.getElementById('resultContent');

  const matchTypeText = result.matchType === 'exact' ? '🎯 Точний збіг' : '🔍 Частковий збіг';

  content.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span style="font-size:32px;">${result.zoneIcon}</span>
            <div>
                <div class="product-name">✅ ${result.productName}</div>
                <div class="product-location">📍 Знайдено у відділі: ${result.zoneName}</div>
                <div style="font-size:13px; color:#6b7a8a; margin-top:4px;">
                    🏷️ Product ID: ${result.productId} · В наявності · ${matchTypeText}
                </div>
            </div>
        </div>
        <div class="mcp-call">
            ➜ MCP виклик: <strong>silpo_find_products_batch</strong>({
                items: [{ query: "${query}" }],
                branchId: "${result.branchId}"
            })<br>
            ➜ Відповідь MCP: знайдено товар <strong>"${result.productName}"</strong> (ID: ${result.productId})<br>
            ➜ Додаткова інформація: зона <strong>"${result.zoneName}"</strong>, доступний для замовлення
        </div>
    `;
  resultBox.classList.add('active');

  console.log('🔍 MCP запит:', {
    tool: 'silpo_find_products_batch',
    arguments: { items: [{ query }], branchId: result.branchId }
  });
  console.log('📦 MCP відповідь:', result.mcpResponse);
}

// ============================================================
// 6. ШВИДКІ ПРИКЛАДИ ДЛЯ ДЕМО
// ============================================================
function addQuickExamples() {
  const examples = ['молоко', 'хліб', 'ковбаса', 'шоколад', 'сир', 'яблука'];
  const searchInput = document.getElementById('searchInput');

  // Додаємо підказки під полем пошуку
  const container = searchInput.parentNode;
  const hint = document.createElement('div');
  hint.style.cssText = `
        width: 100%;
        font-size: 13px;
        color: #6b7a8a;
        margin-top: 8px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
    `;
  hint.innerHTML = `
        <span>⚡ Швидкі приклади:</span>
        ${examples.map(ex =>
    `<span style="
                background: #f5f0eb;
                padding: 4px 12px;
                border-radius: 40px;
                cursor: pointer;
                transition: 0.2s;
                font-size: 12px;
            " onmouseover="this.style.background='#e5e0db'"
               onmouseout="this.style.background='#f5f0eb'"
               onclick="document.getElementById('searchInput').value='${ex}'; searchProduct();">
                ${ex}
            </span>`
  ).join('')}
    `;
  container.appendChild(hint);
}

// ============================================================
// 7. ІНІЦІАЛІЗАЦІЯ
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  renderMap();
  addQuickExamples();

  document.getElementById('searchBtn').addEventListener('click', searchProduct);
  document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      searchProduct();
    }
  });

  console.log('🛒 Навігатор Сільпо готовий!');
  console.log('📋 Спробуйте знайти: молоко, хліб, ковбасу, шоколад, сир, яблука');
});
