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
const COUNTER_ZONES = new Set(['bakery', 'deli', 'fish', 'meat']);

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

function spread(from, to, count) {
  if (count <= 1) return [(from + to) / 2];
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, i) => from + step * (i + 0.5));
}

const SHELF_DEPTH = 0.95;
const WALL_DEPTH = 1.15;
const RING = 3.2;
const FRONT_ZONE = 8;
const PITCH = 3.8;
const CROSS_AISLE = 3.2;

/**
 * Планіровка залу: периметр із фреш-прилавками, «racetrack» по колу,
 * центральні блоки гондол із різною орієнтацією, поперечний коридор,
 * промо-острови у прикасовій зоні та лінія кас.
 * Схема випадкова, але стабільна для конкретного seed.
 */
function planStore(seed, need = 20) {
  const rng = rngFrom(seed);
  const width = 34 + pick(rng, 0, 5) * 2;
  const entranceSide = rng() < 0.5 ? -1 : 1;
  const bandCount = pick(rng, 2, 3);
  const bandSplit = rng() < 0.6;
  const firstOrientation = rng() < 0.5 ? 'ns' : 'ew';

  let hall = { width, depth: 30 };
  let plan = null;

  // Зал росте в обидва боки, поки кожен відділ магазину не отримає власний стелаж.
  for (let attempt = 0; attempt < 14; attempt += 1) {
    plan = layoutSlots({
      rng: rngFrom(`${seed}:${attempt}`),
      ...hall,
      entranceSide,
      bandCount,
      bandSplit,
      firstOrientation
    });
    if (plan.slots.length >= need) break;
    hall = attempt % 2 === 0 ? { ...hall, depth: hall.depth + 4 } : { ...hall, width: hall.width + 3 };
  }

  return { ...plan, seed: String(seed), floor: hall };
}

function layoutSlots({ rng, width, depth, entranceSide, bandCount, bandSplit, firstOrientation }) {
  const frontZ = depth / 2;
  const innerMaxZ = frontZ - FRONT_ZONE;
  const innerMinZ = -depth / 2 + WALL_DEPTH + RING;
  const innerMinX = -width / 2 + WALL_DEPTH + RING;
  const innerMaxX = width / 2 - WALL_DEPTH - RING;

  const slots = [];

  // Периметр: фреш і холодильники вздовж стін, обличчям у racetrack.
  // Відступ WALL_CLEAR — щоб корпус і товари не прорізали 3D-стіну (вона має товщину 0.3).
  const WALL_CLEAR = 0.55;
  const wallFrom = -depth / 2 + WALL_DEPTH + 1.4;
  const wallTo = innerMaxZ + 3.4;
  for (const side of ['left', 'right']) {
    const count = pick(rng, 3, 4);
    const inward = side === 'left' ? 1 : -1;
    const x = inward * (-width / 2 + WALL_CLEAR + WALL_DEPTH / 2);
    for (const z of spread(wallFrom, wallTo, count)) {
      slots.push({
        kind: 'wall',
        side,
        x,
        z,
        // Ліва стіна: +90° дивиться в зал (+X). Права: −90°, інакше товари вилазять назовні.
        rotY: side === 'left' ? Math.PI / 2 : -Math.PI / 2,
        length: (wallTo - wallFrom) / count - 1.1,
        depth: WALL_DEPTH,
        approach: { x: x + inward * (WALL_DEPTH / 2 + 1.4), z }
      });
    }
  }

  const backCount = pick(rng, 3, 4);
  for (const x of spread(innerMinX - 1, innerMaxX + 1, backCount)) {
    slots.push({
      kind: 'wall',
      side: 'back',
      x,
      z: -depth / 2 + WALL_CLEAR + WALL_DEPTH / 2,
      rotY: 0,
      length: (innerMaxX - innerMinX + 2) / backCount - 1.2,
      depth: WALL_DEPTH,
      approach: { x, z: -depth / 2 + WALL_CLEAR + WALL_DEPTH / 2 + 1.4 }
    });
  }

  // Центр: смуги гондол, кожна зі своєю орієнтацією — це дає складнішу сітку коридорів.
  const bands = Math.max(2, Math.min(bandCount, Math.floor((innerMaxX - innerMinX) / 9.5)));
  const bandWidth = (innerMaxX - innerMinX - CROSS_AISLE * (bands - 1)) / bands;
  for (let b = 0; b < bands; b += 1) {
    const bandMinX = innerMinX + b * (bandWidth + CROSS_AISLE);
    const bandMaxX = bandMinX + bandWidth;
    const orientation = b % 2 === 0 ? firstOrientation : firstOrientation === 'ns' ? 'ew' : 'ns';
    const segments = bandSplit && innerMaxZ - innerMinZ > 16 ? 2 : 1;
    const segDepth = (innerMaxZ - innerMinZ - CROSS_AISLE * (segments - 1)) / segments;

    for (let s = 0; s < segments; s += 1) {
      const segMinZ = innerMinZ + s * (segDepth + CROSS_AISLE);
      const segMaxZ = segMinZ + segDepth;

      if (orientation === 'ns') {
        const columns = Math.max(1, Math.floor(bandWidth / PITCH));
        const xs = spread(bandMinX, bandMaxX, columns);
        for (const [i, x] of xs.entries()) {
          const facing = i % 2 === 0 ? 1 : -1;
          slots.push({
            kind: 'island',
            side: 'island',
            x,
            z: (segMinZ + segMaxZ) / 2,
            rotY: Math.PI / 2,
            length: segMaxZ - segMinZ - 1.2,
            depth: SHELF_DEPTH,
            approach: { x: x + facing * (SHELF_DEPTH / 2 + 1.3), z: (segMinZ + segMaxZ) / 2 }
          });
        }
      } else {
        // Ряди вздовж x займають усю смугу: широкі ряди ділимо навпіл поперечним проходом.
        const rows = Math.max(1, Math.floor((segMaxZ - segMinZ) / PITCH));
        const halves = bandWidth > 9 ? 2 : 1;
        const partWidth = (bandWidth - (halves - 1) * CROSS_AISLE) / halves;
        for (const [i, z] of spread(segMinZ, segMaxZ, rows).entries()) {
          const facing = i % 2 === 0 ? 1 : -1;
          for (let h = 0; h < halves; h += 1) {
            const x = bandMinX + partWidth / 2 + h * (partWidth + CROSS_AISLE);
            slots.push({
              kind: 'island',
              side: 'island',
              x,
              z,
              rotY: 0,
              length: partWidth - 1,
              depth: SHELF_DEPTH,
              approach: { x, z: z + facing * (SHELF_DEPTH / 2 + 1.3) }
            });
          }
        }
      }
    }
  }

  // Прикасова зона: вхід з одного боку, каси з іншого, промо-острови між ними.
  const entrance = { x: entranceSide * (width / 2 - 3.2), z: frontZ - 1.6 };
  const registerCount = pick(rng, 4, 6);
  const registers = [];
  for (let i = 0; i < registerCount; i += 1) {
    registers.push({
      x: -entranceSide * (width / 2 - 4.2 - i * 3.6),
      z: frontZ - 2.6,
      width: 2.4,
      depth: 0.9
    });
  }
  const checkout = {
    x: registers[Math.floor(registers.length / 2)].x,
    z: frontZ - 4.6
  };

  const islands = [];
  const islandCount = pick(rng, 2, 4);
  for (const x of spread(-width / 2 + 6, width / 2 - 6, islandCount)) {
    islands.push({ x, z: innerMaxZ + 2.6, size: 1.7, height: 1.1 });
  }

  return {
    entrance,
    checkout,
    registers,
    islands,
    slots,
    bounds: { innerMinX, innerMaxX, innerMinZ, innerMaxZ, frontZ }
  };
}

const CELL = 0.4;
const CLEARANCE = 0.2;

/** Сітка проходимості залу: усе, крім стелажів, кас і стін. */
function buildNav(layout) {
  const { width, depth } = layout.floor;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(depth / CELL);
  const blocked = new Uint8Array(cols * rows);

  const nav = {
    cols,
    rows,
    blocked,
    toX: (c) => -width / 2 + (c + 0.5) * CELL,
    toZ: (r) => -depth / 2 + (r + 0.5) * CELL,
    toCol: (x) => Math.min(cols - 1, Math.max(0, Math.round((x + width / 2) / CELL - 0.5))),
    toRow: (z) => Math.min(rows - 1, Math.max(0, Math.round((z + depth / 2) / CELL - 0.5)))
  };

  const block = (x, z, w, d) => {
    const c0 = nav.toCol(x - w / 2 - CLEARANCE);
    const c1 = nav.toCol(x + w / 2 + CLEARANCE);
    const r0 = nav.toRow(z - d / 2 - CLEARANCE);
    const r1 = nav.toRow(z + d / 2 + CLEARANCE);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) blocked[r * cols + c] = 1;
    }
  };

  // Стіни: ліва, права, задня. Фронт відкритий — там вхід і вихід.
  block(-width / 2, 0, 0.9, depth);
  block(width / 2, 0, 0.9, depth);
  block(0, -depth / 2, width, 0.9);

  for (const shelf of layout.shelves) {
    const alongZ = Math.abs(Math.sin(shelf.rotY || 0)) > 0.5;
    const w = alongZ ? shelf.depth : shelf.width;
    const d = alongZ ? shelf.width : shelf.depth;
    block(shelf.x, shelf.z, w, d);
  }
  for (const register of layout.registers) block(register.x, register.z, register.width, register.depth);
  for (const island of layout.islands) block(island.x, island.z, island.size, island.size);

  return nav;
}

function nearestFree(nav, x, z) {
  const startCol = nav.toCol(x);
  const startRow = nav.toRow(z);
  if (!nav.blocked[startRow * nav.cols + startCol]) return { col: startCol, row: startRow };

  for (let radius = 1; radius < 24; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const row = startRow + dr;
        const col = startCol + dc;
        if (row < 0 || col < 0 || row >= nav.rows || col >= nav.cols) continue;
        if (!nav.blocked[row * nav.cols + col]) return { col, row };
      }
    }
  }
  return { col: startCol, row: startRow };
}

function visible(nav, a, b) {
  const steps = Math.ceil(Math.hypot(b.col - a.col, b.row - a.row) * 2);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const col = Math.round(a.col + (b.col - a.col) * t);
    const row = Math.round(a.row + (b.row - a.row) * t);
    if (nav.blocked[row * nav.cols + col]) return false;
  }
  return true;
}

/** Мінімальна купа для A*: без неї сортування черги з’їдає весь час побудови. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(index, f) {
    const items = this.items;
    items.push({ index, f });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let min = i;
        if (left < items.length && items[left].f < items[min].f) min = left;
        if (right < items.length && items[right].f < items[min].f) min = right;
        if (min === i) break;
        [items[min], items[i]] = [items[i], items[min]];
        i = min;
      }
    }
    return top;
  }
}

/** A* по сітці: маршрут обходить стелажі, як це робить людина в залі. */
function findPath(nav, from, to) {
  const start = nearestFree(nav, from.x, from.z);
  const goal = nearestFree(nav, to.x, to.z);
  const { cols, rows, blocked } = nav;
  const startIndex = start.row * cols + start.col;
  const goalIndex = goal.row * cols + goal.col;

  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const open = new MinHeap();
  open.push(startIndex, 0);
  gScore[startIndex] = 0;

  const octile = (index) => {
    const dc = Math.abs((index % cols) - goal.col);
    const dr = Math.abs(Math.floor(index / cols) - goal.row);
    return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr);
  };

  while (open.size) {
    const current = open.pop().index;
    if (current === goalIndex) break;

    const col = current % cols;
    const row = Math.floor(current / cols);

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const next = nr * cols + nc;
        if (blocked[next]) continue;
        // Діагональ лише коли обидві суміжні клітинки вільні — щоб не «протискатись» кутом.
        if (dr && dc && (blocked[row * cols + nc] || blocked[nr * cols + col])) continue;

        const step = dr && dc ? Math.SQRT2 : 1;
        const tentative = gScore[current] + step;
        if (tentative + 1e-6 >= gScore[next]) continue;
        gScore[next] = tentative;
        cameFrom[next] = current;
        open.push(next, tentative + octile(next));
      }
    }
  }

  if (cameFrom[goalIndex] < 0 && goalIndex !== startIndex) {
    return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  }

  const cells = [];
  for (let index = goalIndex; index >= 0; index = cameFrom[index]) {
    cells.push({ col: index % cols, row: Math.floor(index / cols) });
    if (index === startIndex) break;
  }
  cells.reverse();

  // Прибираємо зайві точки: залишаємо лише повороти, які видно один з одного.
  const keep = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i += 1) {
    if (!visible(nav, cells[anchor], cells[i])) {
      keep.push(cells[i - 1]);
      anchor = i - 1;
    }
  }
  keep.push(cells[cells.length - 1]);

  const points = keep.map((cell) => ({
    x: Number(nav.toX(cell.col).toFixed(2)),
    z: Number(nav.toZ(cell.row).toFixed(2))
  }));
  points[0] = { x: Number(from.x.toFixed(2)), z: Number(from.z.toFixed(2)) };
  points[points.length - 1] = { x: Number(to.x.toFixed(2)), z: Number(to.z.toFixed(2)) };
  return dedupe(points);
}

function dedupe(points) {
  return points.filter(
    (p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.05 || Math.abs(p.z - points[i - 1].z) > 0.05
  );
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
  const islandSlots = plan.slots.filter((s) => s.kind === 'island');
  const rng = rngFrom(`${seed}:height`);
  const shelves = [];
  let wi = 0;
  let ii = 0;

  for (const dept of usable) {
    const wantsWall = PERIMETER_ZONES.has(dept.zone);
    let slot = null;
    if (wantsWall && wi < walls.length) slot = walls[wi++];
    else if (ii < islandSlots.length) slot = islandSlots[ii++];
    else if (wi < walls.length) slot = walls[wi++];
    if (!slot) break;

    const fridge = FRIDGE_ZONES.has(dept.zone) && slot.kind === 'wall';
    const counter = !fridge && COUNTER_ZONES.has(dept.zone) && slot.kind === 'wall';
    const kind = fridge ? 'fridge' : counter ? 'counter' : slot.kind;

    shelves.push({
      id: dept.slug,
      slug: dept.slug,
      name: dept.title,
      sections: [dept.title],
      zone: dept.zone,
      total: dept.total || 0,
      keywords: (dept.keywords || []).slice(0, 80),
      kind,
      side: slot.side,
      x: Number(slot.x.toFixed(2)),
      z: Number(slot.z.toFixed(2)),
      rotY: slot.rotY,
      width: Number(slot.length.toFixed(2)),
      depth: slot.depth,
      height: kind === 'counter' ? 1.25 : kind === 'fridge' ? 2.15 : 1.8 + rng() * 0.5,
      approach: {
        x: Number(slot.approach.x.toFixed(2)),
        z: Number(slot.approach.z.toFixed(2))
      }
    });
  }

  const layout = {
    seed: String(seed),
    floor: plan.floor,
    entrance: plan.entrance,
    checkout: plan.checkout,
    registers: plan.registers,
    islands: plan.islands,
    bounds: plan.bounds,
    shelves
  };

  const nav = buildNav(layout);
  // Сітка потрібна лише серверу для A*, тому не потрапляє у JSON для клієнта.
  Object.defineProperty(layout, 'nav', { value: nav, enumerable: false });

  for (const shelf of shelves) {
    shelf.route = findPath(nav, layout.entrance, shelf.approach);
  }

  return layout;
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
  if (!shelf) return [layout.entrance];
  if (shelf.route?.length) return shelf.route;
  return findPath(layout.nav, layout.entrance, shelf.approach);
}

export function buildMultiRoute(layout, shelves) {
  const stops = [];
  for (const shelf of shelves) {
    if (shelf && !stops.some((s) => s.id === shelf.id)) stops.push(shelf);
  }

  const points = [layout.entrance];
  const order = [];
  let current = layout.entrance;
  const left = [...stops];

  // Найближчий наступний відділ по прямій, а самі переходи вже прокладає A*.
  while (left.length) {
    left.sort(
      (a, b) =>
        Math.hypot(a.approach.x - current.x, a.approach.z - current.z) -
        Math.hypot(b.approach.x - current.x, b.approach.z - current.z)
    );
    const next = left.shift();
    points.push(...findPath(layout.nav, current, next.approach).slice(1));
    order.push({ id: next.id, name: next.name });
    current = next.approach;
  }

  points.push(...findPath(layout.nav, current, layout.checkout).slice(1));
  return { points: dedupe(points), order };
}

export { ZONE_ORDER };
