const VIRTUAL_SLUGS = [
  'spetsialni-propozytsii',
  'vlasni-marky',
  'zdorove-kharchuvannia',
  'bady',
  'lavka-tradytsii'
];

const ZONE_RULES = [
  { zone: 'produce', keys: ['фрукт', 'овоч', 'зелен', 'ягод', 'ягід', 'банан', 'яблук', 'помідор', 'огірк', 'картопл', 'цибул', 'моркв', 'салат'] },
  { zone: 'bakery', keys: ['хліб', 'випіч', 'батон', 'булоч', 'багет', 'круасан', 'лаваш', 'тортил'] },
  { zone: 'frozen', keys: ['заморож', 'заморозк', 'морозив', 'пельмен', 'вареник', 'напівфабрикат'] },
  { zone: 'snacks', keys: ['снек', 'чипс', 'сухар', 'попкорн', 'горіш', 'кранч'] },
  { zone: 'dairy', keys: ['молок', 'молоч', 'йогурт', 'кефір', 'сметан', 'масло', 'яйц', 'ряжанк', 'сирок', 'сир кисломолочн', 'сир твор', 'вершк'] },
  { zone: 'cheese', keys: ['сир', 'моцарел', 'бринз', 'пармезан', 'фета'] },
  { zone: 'sausage', keys: ['ковбас', 'сосиск', 'шинк', 'делікатес', 'салям', 'бекон', 'паштет'] },
  { zone: 'meat', keys: ['м\'яс', 'мяс', 'куряти', 'свинин', 'ялович', 'фарш', 'стейк', 'індич'] },
  { zone: 'fish', keys: ['риб', 'морепрод', 'ікр', 'кальмар', 'креветк', 'сельд', 'скумбр', 'лосос'] },
  { zone: 'deli', keys: ['готов', 'кулінар', 'страв', 'піц', 'суші'] },
  { zone: 'grocery', keys: ['бакал', 'консерв', 'круп', 'рис', 'гречк', 'макарон', 'борошн', 'цукор', 'олі', 'сіль'] },
  { zone: 'sauces', keys: ['соус', 'спеці', 'кетчуп', 'майонез', 'приправ', 'оцет', 'гірчиц'] },
  { zone: 'sweets', keys: ['солод', 'шоколад', 'печив', 'цукерк', 'вафл', 'десерт', 'зефір', 'мармелад'] },
  { zone: 'coffee', keys: ['кава', 'чай', 'какао', 'капучин'] },
  { zone: 'drinks', keys: ['напо', 'вода', 'сік', 'лимонад', 'кола', 'енергет', 'квас'] },
  { zone: 'alcohol', keys: ['алког', 'вино', 'пиво', 'віск', 'горілк', 'коньяк', 'шампан', 'сидр', 'лікер'] },
  { zone: 'tobacco', keys: ['сигарет', 'стік', 'жуйк', 'тютюн'] },
  { zone: 'household', keys: ['для дому', 'побутов', 'хімі', 'пранн', 'мийн', 'посуд', 'папер', 'серветк'] },
  { zone: 'care', keys: ['гігієн', 'крас', 'шампун', 'зубн', 'космет', 'дезодор', 'гель для душ', 'крем'] },
  { zone: 'health', keys: ['аптечк', 'здоров', 'вітамін', 'бад'] },
  { zone: 'kids', keys: ['дитяч', 'памперс', 'підгузк', 'іграшк'] },
  { zone: 'pets', keys: ['тварин', 'корм', 'котів', 'собак'] },
  { zone: 'garden', keys: ['квіт', 'сад', 'город', 'ґрунт', 'насінн'] }
];

const ZONE_ORDER = [
  'produce', 'bakery', 'deli', 'cheese', 'sausage', 'meat', 'fish', 'dairy',
  'frozen', 'grocery', 'sauces', 'coffee', 'sweets', 'snacks', 'drinks',
  'alcohol', 'health', 'care', 'kids', 'household', 'pets', 'garden', 'tobacco', 'other'
];

// Відділи, які в реальному магазині стоять по периметру (фреш, холодильники).
const PERIMETER_ZONES = new Set(['produce', 'bakery', 'deli', 'cheese', 'sausage', 'meat', 'fish', 'dairy', 'frozen']);
const FRIDGE_ZONES = new Set(['dairy', 'meat', 'fish', 'frozen', 'cheese', 'sausage']);

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let a = hash(String(seed)) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const jitter = (rng, amount) => (rng() - 0.5) * 2 * amount;

function spread(from, to, count) {
  if (count === 1) return [(from + to) / 2];
  const step = (to - from) / (count - 1);
  return Array.from({ length: count }, (_, i) => from + step * i);
}

/**
 * Випадкова, але стабільна для конкретного seed планіровка залу.
 * Реальних схем стелажів у Сільпо немає — мережа задає їх сама,
 * тому генеруємо правдоподібний зал: периметр + гондоли + коридори.
 */
function planStore(seed, need = 20) {
  const rng = rngFrom(seed);

  const width = 28 + pick(rng, 0, 5) * 2;
  const entranceSide = rng() < 0.5 ? -1 : 1;

  const wallCounts = { left: pick(rng, 2, 4), right: pick(rng, 2, 4), back: pick(rng, 2, 4) };
  const wallTotal = wallCounts.left + wallCounts.right + wallCounts.back;
  const columns = pick(rng, 3, 5);
  const rows = Math.max(pick(rng, 2, 3), Math.ceil(Math.max(0, need - wallTotal) / columns));

  // Кожен ряд гондол потребує місця в глибину — зал росте разом із кількістю відділів.
  const depth = 24 + pick(rng, 0, 3) * 2 + Math.max(0, rows - 3) * 5;

  const frontAisleZ = depth / 2 - 5.5;
  const backAisleZ = -depth / 2 + 4.2;
  const sideAisleX = { left: -width / 2 + 4, right: width / 2 - 4 };

  const entrance = { x: entranceSide * (width / 2 - 3.5), z: depth / 2 - 1 };
  const checkout = { x: -entranceSide * (width / 2 - 7), z: depth / 2 - 3.2 };

  const slots = [];
  const wallFrom = backAisleZ + 2.2;
  const wallTo = frontAisleZ - 2.2;

  for (const side of ['left', 'right']) {
    const count = wallCounts[side];
    const x = side === 'left' ? -width / 2 + 1.1 : width / 2 - 1.1;
    for (const z of spread(wallFrom, wallTo, count)) {
      const height = (wallTo - wallFrom) / count - 1.3;
      slots.push({
        kind: 'wall',
        side,
        x,
        z: z + jitter(rng, 0.3),
        rotY: Math.PI / 2,
        width: Math.max(3, height),
        aisle: { x: sideAisleX[side], z }
      });
    }
  }

  const backCount = wallCounts.back;
  for (const x of spread(sideAisleX.left + 2.5, sideAisleX.right - 2.5, backCount)) {
    slots.push({
      kind: 'wall',
      side: 'back',
      x: x + jitter(rng, 0.4),
      z: -depth / 2 + 1.1,
      rotY: 0,
      width: (sideAisleX.right - sideAisleX.left - 5) / backCount - 1.2,
      aisle: { x, z: backAisleZ }
    });
  }

  const columnXs = spread(sideAisleX.left + 3.2, sideAisleX.right - 3.2, columns);
  const gap = columns > 1 ? (columnXs[1] - columnXs[0]) / 2 : 3;
  const rowZs = spread(backAisleZ + 2.6, frontAisleZ - 2.6, rows);
  const rowWidth = (frontAisleZ - backAisleZ - 5.2) / rows - 1.4;

  for (const [ci, x] of columnXs.entries()) {
    const aisleX = entranceSide > 0
      ? (ci === columns - 1 ? x - gap : x + gap)
      : (ci === 0 ? x + gap : x - gap);
    for (const z of rowZs) {
      slots.push({
        kind: 'island',
        side: 'island',
        x,
        z: z + jitter(rng, 0.4),
        rotY: Math.PI / 2,
        width: Math.max(3, rowWidth),
        aisle: { x: aisleX, z }
      });
    }
  }

  return {
    rng,
    floor: { width, depth },
    entrance,
    checkout,
    frontAisleZ,
    backAisleZ,
    sideAisleX,
    slots
  };
}

function dedupe(points) {
  return points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.05 || Math.abs(p.z - points[i - 1].z) > 0.05);
}

function pathFor(slot, plan) {
  const { frontAisleZ, backAisleZ, sideAisleX } = plan;

  if (slot.side === 'back') {
    const sideX = slot.x < 0 ? sideAisleX.left : sideAisleX.right;
    return dedupe([
      { x: sideX, z: frontAisleZ },
      { x: sideX, z: backAisleZ },
      { x: slot.aisle.x, z: backAisleZ }
    ]);
  }

  return dedupe([
    { x: slot.aisle.x, z: frontAisleZ },
    { x: slot.aisle.x, z: slot.aisle.z }
  ]);
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-zа-яїієґ'’]+/i)
    .filter((w) => w.length > 3);
}

function stem(word) {
  return word.slice(0, 5);
}

// Перемагає правило, чиє слово стоїть найближче до початку назви:
// «Чипси фруктові» — снеки, «Заморожені морепродукти» — заморозка.
function zoneOf(text) {
  const value = String(text || '').toLowerCase();
  let zone = 'other';
  let bestIndex = Infinity;

  for (const rule of ZONE_RULES) {
    for (const key of rule.keys) {
      const index = value.indexOf(key);
      if (index >= 0 && index < bestIndex) {
        bestIndex = index;
        zone = rule.zone;
      }
    }
  }

  return zone;
}

// У назві товару категорію задають перші слова: «Чипси фруктові» — це снеки, не фрукти.
function productZoneOf(text) {
  const head = String(text || '').trim().split(/\s+/).slice(0, 2).join(' ');
  const headZone = zoneOf(head);
  return headZone !== 'other' ? headZone : zoneOf(text);
}

function isVirtual(slug) {
  return VIRTUAL_SLUGS.some((v) => String(slug || '').startsWith(v));
}

/**
 * departments — реальні кореневі категорії магазину з MCP.
 * seed — будь-який рядок: той самий seed завжди дає ту саму схему.
 */
export function buildLayout(departments = [], seed = 'silpo') {
  const usable = departments
    .filter((d) => d.title && !isVirtual(d.slug))
    .map((d) => ({ ...d, zone: zoneOf(d.title) }));

  usable.sort((a, b) => {
    const ai = ZONE_ORDER.indexOf(a.zone);
    const bi = ZONE_ORDER.indexOf(b.zone);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return (b.total || 0) - (a.total || 0);
  });

  const plan = planStore(seed, usable.length);
  const walls = plan.slots.filter((s) => s.kind === 'wall');
  const islands = plan.slots.filter((s) => s.kind === 'island');
  const shelves = [];
  let wi = 0;
  let ii = 0;

  for (const dept of usable) {
    const wantsWall = PERIMETER_ZONES.has(dept.zone);
    let slot = null;
    if (wantsWall && wi < walls.length) slot = walls[wi++];
    else if (ii < islands.length) slot = islands[ii++];
    else if (wi < walls.length) slot = walls[wi++];

    // Стелажів менше, ніж відділів — залишок стає додатковою секцією на найменш завантаженому стелажі.
    if (!slot) {
      const host = shelves
        .filter((s) => s.kind !== 'fridge')
        .sort((a, b) => a.sections.length - b.sections.length)[0];
      if (!host) break;
      host.sections.push(dept.title);
      host.keywords = [...host.keywords, dept.title, ...(dept.keywords || [])].slice(0, 120);
      host.total += dept.total || 0;
      continue;
    }

    const fridge = FRIDGE_ZONES.has(dept.zone);
    shelves.push({
      id: dept.slug,
      slug: dept.slug,
      name: dept.title,
      sections: [dept.title],
      zone: dept.zone,
      total: dept.total || 0,
      keywords: (dept.keywords || []).slice(0, 80),
      kind: fridge ? 'fridge' : slot.kind,
      side: slot.side,
      x: Number(slot.x.toFixed(2)),
      z: Number(slot.z.toFixed(2)),
      rotY: slot.rotY,
      width: Number(slot.width.toFixed(2)),
      depth: fridge ? 1.05 : 0.9,
      height: fridge ? 2.1 : 1.9 + plan.rng() * 0.5,
      approach: slot.aisle,
      path: pathFor(slot, plan)
    });
  }

  return {
    seed: String(seed),
    floor: plan.floor,
    entrance: plan.entrance,
    checkout: plan.checkout,
    frontAisleZ: plan.frontAisleZ,
    backAisleZ: plan.backAisleZ,
    sideAisleX: plan.sideAisleX,
    shelves
  };
}

export function matchShelf(product, shelves) {
  if (!shelves?.length) return null;
  const text = [
    product.name,
    product.slug,
    product.category,
    product.categoryName,
    product.categorySlug,
    Array.isArray(product.categories) ? product.categories.map((c) => c.title || c.name || c).join(' ') : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const productZone = productZoneOf(product.name || text);
  const productStems = new Set(tokens(text).map(stem));

  let best = null;
  let bestScore = 0;

  for (const shelf of shelves) {
    let score = 0;
    if (productZone !== 'other' && shelf.zone === productZone) score += 10;

    const name = shelf.name.toLowerCase();
    if (text.includes(name)) score += 6;
    for (const w of tokens(name)) {
      if (text.includes(w)) score += 3;
      else if (productStems.has(stem(w))) score += 2;
    }

    let keywordScore = 0;
    for (const keyword of shelf.keywords || []) {
      const kw = keyword.toLowerCase();
      if (kw.length > 4 && text.includes(kw)) keywordScore += 5;
      else if (tokens(kw).some((w) => productStems.has(stem(w)))) keywordScore += 2;
    }
    score += Math.min(keywordScore, 15);

    if (score > bestScore) {
      bestScore = score;
      best = shelf;
    }
  }

  return bestScore > 0 ? best : null;
}

export function buildRoute(layout, shelf) {
  const entrance = layout.entrance;
  if (!shelf) return [entrance];
  return dedupe([
    entrance,
    { x: entrance.x, z: layout.frontAisleZ },
    ...shelf.path
  ]);
}

export function buildMultiRoute(layout, shelves) {
  const stops = [];
  for (const shelf of shelves) {
    if (shelf && !stops.some((s) => s.id === shelf.id)) stops.push(shelf);
  }

  const entrance = layout.entrance;
  const points = [entrance, { x: entrance.x, z: layout.frontAisleZ }];
  const order = [];
  let current = points[points.length - 1];
  const left = [...stops];

  while (left.length) {
    // Найближчий наступний відділ по коридорах: спершу вздовж головного проходу, потім у ряд.
    left.sort((a, b) => {
      const da = Math.abs(a.path[0].x - current.x) + Math.abs(a.approach.z - layout.frontAisleZ);
      const db = Math.abs(b.path[0].x - current.x) + Math.abs(b.approach.z - layout.frontAisleZ);
      return da - db;
    });
    const next = left.shift();
    points.push({ x: next.path[0].x, z: layout.frontAisleZ }, ...next.path);
    order.push({ id: next.id, name: next.name });
    points.push({ x: next.path[0].x, z: layout.frontAisleZ });
    current = { x: next.path[0].x, z: layout.frontAisleZ };
  }

  points.push({ x: layout.checkout.x, z: layout.frontAisleZ }, layout.checkout);
  return { points: dedupe(points), order };
}

export { ZONE_ORDER };
