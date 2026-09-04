import { buildLayout, buildMultiRoute, buildRoute, matchShelf } from './layout.js';

// Публічні дані каталогу кешуємо на процес — вони однакові для всіх гостей.
const storesCache = { at: 0, stores: [] };
const slotCache = new Map();
const deptCache = new Map();
const layoutCache = new Map();
const promoCache = new Map();

const MINUTE = 60 * 1000;

// Tools офіційного MCP «Сільпо», на яких тримається навігатор.
export const USED_TOOLS = [
  'silpo_list_branches',
  'silpo_get_time_slots',
  'silpo_get_categories',
  'silpo_get_categories_tree',
  'silpo_find_products_batch',
  'silpo_get_products',
  'silpo_get_promotions',
  'silpo_get_my_shopping_cart',
  'silpo_create_shopping_cart',
  'silpo_get_shopping_cart_by_id',
  'silpo_add_or_update_cart_products',
  'silpo_remove_cart_products',
  'silpo_get_loyalty_info',
  'silpo_get_my_profile'
];

// «Київ, вулиця Івана Франка» має знаходити «Київ, вул. Івана Франка».
const STREET_WORDS = ['вулиця', 'вул', 'проспект', 'просп', 'бульвар', 'бул', 'площа', 'пл', 'шосе', 'провулок', 'пров', 'набережна'];

function searchTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-zа-яїієґ0-9]+/i)
    .filter(Boolean)
    .filter((word) => !STREET_WORDS.includes(word))
    .map((word) => (word.length > 4 ? word.slice(0, -1) : word));
}

function normalizeStore(branch) {
  const city = (branch.city || '').trim();
  const address = (branch.address || '').trim();
  return {
    id: branch.branchId,
    companyId: branch.companyId,
    city,
    address,
    title: [city, address].filter(Boolean).join(', ') || 'Магазин Сільпо',
    latitude: Number(branch.latitude) || null,
    longitude: Number(branch.longitude) || null,
    hasPickup: Boolean(branch.hasPickup),
    open: Boolean(branch.open)
  };
}

export async function listStores(call, { q, city } = {}) {
  if (!storesCache.stores.length || Date.now() - storesCache.at > 15 * MINUTE) {
    const stores = [];
    let offset = 0;

    for (;;) {
      const data = await call('silpo_list_branches', { limit: 500, offset });
      const batch = Array.isArray(data?.branches) ? data.branches : [];
      stores.push(...batch.map(normalizeStore).filter((s) => s.id && s.address));
      const total = Number(data?.meta?.total ?? stores.length);
      offset += batch.length;
      if (!batch.length || offset >= total) break;
    }

    const seen = new Set();
    const unique = stores.filter((s) => {
      const key = `${s.city}|${s.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    storesCache.stores = unique;
    storesCache.at = Date.now();
  }

  const terms = searchTerms(q);
  const filtered = storesCache.stores.filter((store) => {
    if (city && store.city !== city) return false;
    if (!terms.length) return true;
    const title = store.title.toLowerCase();
    return terms.every((term) => title.includes(term));
  });

  return {
    total: storesCache.stores.length,
    count: filtered.length,
    cities: [...new Set(storesCache.stores.map((s) => s.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    stores: filtered
  };
}

/** Контекст кошика (branchId + доставка + слот) потрібен майже всім tools каталогу. */
export async function branchContext(call, branchId) {
  const cached = slotCache.get(branchId);
  if (cached && Date.now() - cached.at < 5 * MINUTE) return cached.ctx;

  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const attempts = [
    { branchId, limit: 100 },
    { branchId, limit: 100, deliveryTypes: ['SelfPickup'] },
    { branchId, limit: 100, deliveryTypes: ['DeliveryHome', 'WideAssortDelivery', 'LongDelivery'] },
    { branchId, limit: 100, start: tomorrow }
  ];

  for (const args of attempts) {
    const data = await call('silpo_get_time_slots', args);
    const slots = Array.isArray(data?.slots) ? data.slots : [];
    const slot = slots.find((s) => s.available) || slots[0];
    if (slot?.start && slot?.end) {
      const ctx = {
        branchId,
        deliveryType: slot.deliveryType || 'SelfPickup',
        timeslotStart: slot.start,
        timeslotEnd: slot.end
      };
      slotCache.set(branchId, { at: Date.now(), ctx });
      return ctx;
    }
  }

  throw new Error('Для цього магазину MCP не віддає слотів доставки');
}

async function fetchCategories(call, branchId) {
  const all = [];
  let offset = 0;

  for (;;) {
    const data = await call('silpo_get_categories', { branchId, limit: 1000, offset });
    const batch = Array.isArray(data?.categories) ? data.categories : [];
    all.push(...batch);
    const total = Number(data?.meta?.total ?? all.length);
    offset += batch.length;
    if (!batch.length || offset >= total) break;
  }

  return all;
}

function collectSlugs(node, out = []) {
  if (node?.slug) out.push(node.slug);
  for (const child of node?.children || []) collectSlugs(child, out);
  return out;
}

// Якщо слотів немає, дерево категорій недоступне — збираємо відділи з плоского списку.
function departmentsFromFlat(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const childrenOf = new Map();
  for (const category of categories) {
    if (!category.parentId) continue;
    if (!childrenOf.has(category.parentId)) childrenOf.set(category.parentId, []);
    childrenOf.get(category.parentId).push(category);
  }

  const descendants = (id, out = []) => {
    for (const child of childrenOf.get(id) || []) {
      out.push(child.title);
      descendants(child.id, out);
    }
    return out;
  };

  return categories
    .filter((c) => (!c.parentId || !byId.has(c.parentId)) && c.title)
    .map((root) => {
      const keywords = descendants(root.id);
      return { slug: root.slug, title: root.title, total: keywords.length, keywords };
    });
}

async function fetchDepartments(call, branchId) {
  const [flat, ctx] = await Promise.all([
    fetchCategories(call, branchId),
    branchContext(call, branchId).catch(() => null)
  ]);

  const titles = new Map(flat.filter((c) => c.slug && c.title).map((c) => [c.slug, c.title]));
  if (!ctx) return departmentsFromFlat(flat);

  const tree = await call('silpo_get_categories_tree', ctx).catch(() => null);
  const roots = Array.isArray(tree?.tree) ? tree.tree : tree?.categories || [];
  if (!roots.length) return departmentsFromFlat(flat);

  return roots
    .map((root) => ({
      slug: root.slug,
      title: titles.get(root.slug) || root.title || null,
      total: Number(root.total || 0),
      keywords: collectSlugs(root)
        .map((slug) => titles.get(slug))
        .filter(Boolean)
        .slice(1)
    }))
    .filter((dept) => dept.title);
}

export async function getLayout(call, branchId, seed = branchId) {
  const key = `${branchId}:${seed}`;
  const cached = layoutCache.get(key);
  if (cached && Date.now() - cached.at < 30 * MINUTE) return cached.layout;

  let departments = deptCache.get(branchId);
  if (!departments || Date.now() - departments.at > 30 * MINUTE) {
    departments = { at: Date.now(), list: await fetchDepartments(call, branchId) };
    deptCache.set(branchId, departments);
  }

  const layout = buildLayout(departments.list, seed);
  layoutCache.set(key, { at: Date.now(), layout });
  return layout;
}

function normalizeProduct(product) {
  const price = product.price ?? product.currentPrice ?? null;
  const oldPrice = product.oldPrice ?? product.priceOld ?? null;
  const image =
    product.image ||
    product.mainImage ||
    product.imageUrl ||
    (Array.isArray(product.images) ? product.images[0]?.url || product.images[0] : null) ||
    null;
  const special = Array.isArray(product.specialPrices) ? product.specialPrices[0] : null;

  return {
    id: product.id || product.productId,
    companyId: product.companyId ?? null,
    branchId: product.branchId ?? null,
    slug: product.slug || null,
    name: product.name || product.title || 'Товар',
    displayRatio: product.displayRatio || null,
    price,
    oldPrice: oldPrice && oldPrice !== price ? oldPrice : null,
    specialPrice: special ? { price: special.price, count: special.count } : null,
    hasPromotion: Boolean(oldPrice || special),
    stock: product.stock ?? null,
    step: product.step ?? 1,
    image,
    category: product.category || product.categoryName || null,
    categorySlug: product.categorySlug || null
  };
}

function withNavigation(products, layout) {
  return products.map((item) => {
    const product = normalizeProduct(item);
    const shelf = matchShelf(product, layout.shelves);
    return {
      ...product,
      shelfId: shelf?.id || null,
      shelfName: shelf?.name || null,
      shelfZone: shelf?.zone || null,
      route: buildRoute(layout, shelf)
    };
  });
}

// MCP ранжує за релевантністю тексту, тому «кава» може дати молочний напій з кавою.
// Ставимо вперед товари з того відділу, який відповідає самому запиту.
function rankByQuery(products, layout, query) {
  const target = matchShelf({ name: query }, layout.shelves);
  if (!target) return products;
  return [
    ...products.filter((p) => p.shelfId === target.id),
    ...products.filter((p) => p.shelfId !== target.id)
  ];
}

export async function searchProduct(call, { branchId, query, seed }) {
  const ctx = await branchContext(call, branchId);
  const [layout, data] = await Promise.all([
    getLayout(call, branchId, seed || branchId),
    call('silpo_find_products_batch', { ...ctx, products: [query], limit: 24 })
  ]);

  const found = data?.queries?.[0];
  return {
    totalFound: found?.totalFound ?? 0,
    deliveryType: ctx.deliveryType,
    products: rankByQuery(withNavigation(found?.products || [], layout), layout, query)
  };
}

export async function searchList(call, { branchId, items, seed }) {
  const ctx = await branchContext(call, branchId);
  const [layout, data] = await Promise.all([
    getLayout(call, branchId, seed || branchId),
    call('silpo_find_products_batch', { ...ctx, products: items, limit: 5 })
  ]);

  const results = (data?.queries || []).map((q, i) => {
    const query = q.query || items[i] || '';
    const products = rankByQuery(withNavigation(q.products || [], layout), layout, query);
    return { query, best: products[0] || null, products };
  });

  const shelves = results
    .map((r) => layout.shelves.find((s) => s.id === r.best?.shelfId))
    .filter(Boolean);
  const { points, order } = buildMultiRoute(layout, shelves);

  return { results, route: points, order };
}

/** «Цінотижики» магазину — джерело підказок «по дорозі». */
async function weeklyPromos(call, branchId) {
  const cached = promoCache.get(branchId);
  if (cached && Date.now() - cached.at < 20 * MINUTE) return cached;

  const ctx = await branchContext(call, branchId);
  const promotions = await call('silpo_get_promotions', ctx);
  const list = promotions?.promotions || promotions?.items || [];
  const weekly = list.find((p) => /цінотиж/i.test(p.title || '')) || list[0];
  if (!weekly?.code) return { at: Date.now(), title: 'Акції', products: [] };

  const data = await call('silpo_get_products', { ...ctx, promotionCode: weekly.code, limit: 100 });
  const entry = {
    at: Date.now(),
    title: weekly.title || 'Ціна тижня',
    products: (data?.products || data?.items || []).map(normalizeProduct)
  };
  promoCache.set(branchId, entry);
  return entry;
}

function distanceToRoute(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1];
    const b = route[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz)));
  }
  return best;
}

export async function promosOnTheWay(call, { branchId, seed, route, skipShelfIds = [] }) {
  const layout = await getLayout(call, branchId, seed || branchId);
  const promo = await weeklyPromos(call, branchId);

  const byShelf = new Map();
  for (const product of promo.products) {
    const shelf = matchShelf(product, layout.shelves);
    if (!shelf) continue;
    if (!byShelf.has(shelf.id)) byShelf.set(shelf.id, []);
    byShelf.get(shelf.id).push(product);
  }

  const discountOf = (p) => (p.oldPrice && p.price ? p.oldPrice - p.price : 0);
  const suggestions = [];

  for (const shelf of layout.shelves) {
    if (skipShelfIds.includes(shelf.id)) continue;
    const distance = distanceToRoute(shelf.approach, route);
    if (distance > 5) continue;

    const items = (byShelf.get(shelf.id) || []).sort((a, b) => discountOf(b) - discountOf(a));
    if (!items.length) continue;

    const product = items[0];
    const discount = discountOf(product);
    suggestions.push({
      shelfId: shelf.id,
      shelfName: shelf.name,
      detourMeters: Math.round(distance * 10) / 10,
      discount: Math.round(discount * 100) / 100,
      discountPercent: product.oldPrice ? Math.round((discount / product.oldPrice) * 100) : 0,
      product: { ...product, shelfName: shelf.name, route: buildRoute(layout, shelf) }
    });
  }

  suggestions.sort((a, b) => b.discount - a.discount);
  return { promoTitle: promo.title, suggestions: suggestions.slice(0, 4) };
}

function cartSummary(payload) {
  const cart = payload?.cart || payload || {};
  const calc = cart.calculation || {};
  const items = (cart.shipments || []).flatMap((s) => s.products || []);
  return {
    id: cart.id || null,
    branchId: cart.shipments?.[0]?.branchId || null,
    deliveryType: cart.deliveryType || null,
    count: items.reduce((sum, p) => sum + (p.quantity || 0), 0),
    positions: items.length,
    total: calc.totalAfterDiscounts ?? calc.total ?? 0,
    discount: calc.subDiscount ?? 0,
    bonusAvailable: payload?.loyalty?.bonusAvailable ?? null,
    bonusTotal: payload?.loyalty?.bonusTotal ?? null,
    items: items.map((p) => ({
      productId: p.productId || p.id,
      name: p.name || '',
      quantity: p.quantity || 0,
      price: p.price ?? null
    }))
  };
}

async function cartId(call) {
  const mine = await call('silpo_get_my_shopping_cart', {});
  if (mine?.shoppingCartId) return mine.shoppingCartId;
  const created = await call('silpo_create_shopping_cart', {});
  const id = created?.shoppingCartId || created?.cart?.id || null;
  if (!id) throw new Error('Не вдалося створити кошик «Сільпо»');
  return id;
}

export async function readCart(call) {
  const id = await cartId(call);
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

export async function addToCart(call, { branchId, productId, companyId, quantity = 1 }) {
  const id = await cartId(call);
  await call('silpo_add_or_update_cart_products', {
    shoppingCartId: id,
    products: [{ productId, companyId, branchId, quantity }]
  });
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

export async function removeFromCart(call, { productId }) {
  const id = await cartId(call);
  await call('silpo_remove_cart_products', {
    shoppingCartId: id,
    products: [{ productId }]
  });
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

export async function readProfile(call) {
  const [profile, loyalty] = await Promise.all([
    call('silpo_get_my_profile', {}).catch(() => null),
    call('silpo_get_loyalty_info', {}).catch(() => null)
  ]);
  return { profile, loyalty };
}
