import { buildLayout, buildMultiRoute, buildRoute, matchShelf } from './layout.js';

// Публічні дані каталогу кешуємо на процес — вони однакові для всіх гостей.
const storesCache = { at: 0, stores: [] };
const slotCache = new Map();
const deptCache = new Map();
const layoutCache = new Map();
const promoCache = new Map();

const MINUTE = 60 * 1000;

// Усі 40 tools офіційного MCP «Сільпо» — кожен закриває крок навігації, а не «для галочки».
export const USED_TOOLS = [
  'silpo_list_branches',
  'silpo_get_time_slots',
  'silpo_get_categories',
  'silpo_get_categories_tree',
  'silpo_get_category',
  'silpo_get_popular_categories',
  'silpo_get_product_sets',
  'silpo_find_products_batch',
  'silpo_get_products',
  'silpo_get_product_details',
  'silpo_get_similar_products',
  'silpo_get_replacements',
  'silpo_get_promotions',
  'silpo_get_my_shopping_cart',
  'silpo_create_shopping_cart',
  'silpo_get_shopping_cart_by_id',
  'silpo_add_or_update_cart_products',
  'silpo_remove_cart_products',
  'silpo_clear_shopping_cart',
  'silpo_update_shopping_cart',
  'silpo_add_or_update_certificates',
  'silpo_get_loyalty_info',
  'silpo_get_my_profile',
  'silpo_get_my_family',
  'silpo_get_my_food_restrictions',
  'silpo_get_my_favorites',
  'silpo_add_or_update_favorite_products',
  'silpo_get_my_coupons',
  'silpo_get_coupon_details',
  'silpo_get_my_promos',
  'silpo_get_promo_codes',
  'silpo_get_my_certificates',
  'silpo_get_my_premium_subscription',
  'silpo_get_my_online_orders',
  'silpo_get_my_offline_orders',
  'silpo_get_my_delivery_addresses',
  'silpo_find_address',
  'silpo_get_available_delivery_types',
  'silpo_find_nova_poshta_settlements',
  'silpo_find_nova_poshta_offices'
];

const soft = (promise) => promise.catch(() => null);
const listOf = (...candidates) => {
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

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
  const key = `${branchId}:${seed}:v2`;
  const cached = layoutCache.get(key);
  if (cached && Date.now() - cached.at < 30 * MINUTE) return cached.layout;

  let departments = deptCache.get(branchId);
  if (!departments || Date.now() - departments.at > 30 * MINUTE) {
    departments = { at: Date.now(), list: await fetchDepartments(call, branchId) };
    deptCache.set(branchId, departments);
  }

  const layout = buildLayout(departments.list, seed);

  // Популярні категорії філії підсвічуємо на схемі — Гість одразу бачить, куди зараз ідуть люди.
  const ctx = await branchContext(call, branchId).catch(() => null);
  if (ctx) {
    const popular = await soft(call('silpo_get_popular_categories', {
      branchId,
      deliveryType: ctx.deliveryType
    }));
    const slugs = new Set(listOf(popular?.categories, popular?.items, popular?.popularCategories)
      .map((c) => c.slug || c.categorySlug)
      .filter(Boolean));
    for (const shelf of layout.shelves) {
      if (slugs.has(shelf.slug)) shelf.popular = true;
    }
  }
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
    externalProductId: product.externalProductId || product.lagerId || null,
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
    bonusAvailable: payload?.loyalty?.bonusAvailable ?? cart.bonusAvailable ?? null,
    bonusTotal: payload?.loyalty?.bonusTotal ?? cart.bonusTotal ?? null,
    certificates: listOf(cart.certificates, payload?.certificates),
    validations: listOf(cart.validations, payload?.validations),
    promoCode: cart.promoCode || null,
    timeslot: cart.timeslot || null,
    address: cart.address || null,
    checkoutUrl: cart.checkoutUrl || cart.webLink || cart.webUrl || payload?.checkoutUrl || 'https://silpo.ua/cart',
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

export async function clearCart(call) {
  const id = await cartId(call);
  await call('silpo_clear_shopping_cart', { shoppingCartId: id });
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

async function cartPayload(call) {
  const id = await cartId(call);
  const payload = await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id });
  return { id, payload, cart: payload?.cart || payload || {} };
}

export async function updateCart(call, patch = {}) {
  const { id, cart } = await cartPayload(call);
  if (!cart.timeslot || !cart.address || !cart.shipments) {
    throw new Error('Кошик ще без адреси чи слота — спочатку оберіть доставку в застосунку «Сільпо»');
  }
  const body = {
    shoppingCartId: id,
    deliveryType: patch.deliveryType || cart.deliveryType,
    timeslot: patch.timeslot || cart.timeslot,
    address: patch.address || cart.address,
    shipments: cart.shipments
  };
  if (patch.branchId) body.branchId = patch.branchId;
  if (patch.promoCode != null) body.promoCode = patch.promoCode;
  if (patch.bonusRequested != null) body.bonusRequested = patch.bonusRequested;
  if (patch.isAdultConfirmed != null) body.isAdultConfirmed = patch.isAdultConfirmed;
  await call('silpo_update_shopping_cart', body);
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

export async function applyCertificates(call, { certificatesToAdd = [], certificatesToRemove = [] }) {
  const id = await cartId(call);
  await call('silpo_add_or_update_certificates', { shoppingCartId: id, certificatesToAdd, certificatesToRemove });
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

function routePack(layout, products) {
  const navigated = withNavigation(products, layout);
  const shelves = navigated
    .map((p) => layout.shelves.find((s) => s.id === p.shelfId))
    .filter(Boolean);
  const { points, order } = buildMultiRoute(layout, shelves);
  return { products: navigated, route: points, order };
}

function restrictionLabels(raw) {
  const items = listOf(raw?.restrictions, raw?.items, raw?.foodRestrictions, Array.isArray(raw) ? raw : []);
  return items
    .map((item) => (typeof item === 'string' ? item : item.title || item.name || item.code || ''))
    .filter(Boolean);
}

function familyHints(raw) {
  const children = listOf(raw?.children, raw?.kids);
  const pets = listOf(raw?.pets, raw?.animals);
  const members = listOf(raw?.members, raw?.familyMembers);
  const hints = [];
  if (children.length || members.some((m) => /дитин|child|kid/i.test(JSON.stringify(m)))) hints.push('kids');
  if (pets.length) hints.push('pets');
  return {
    members: members.length,
    children: children.length,
    pets: pets.length,
    zones: hints
  };
}

export async function readProfile(call) {
  const [profile, loyalty, family, restrictions, premium, coupons, promos, codes, certificates, addresses] = await Promise.all([
    soft(call('silpo_get_my_profile', {})),
    soft(call('silpo_get_loyalty_info', {})),
    soft(call('silpo_get_my_family', {})),
    soft(call('silpo_get_my_food_restrictions', {})),
    soft(call('silpo_get_my_premium_subscription', {})),
    soft(call('silpo_get_my_coupons', {})),
    soft(call('silpo_get_my_promos', {})),
    soft(call('silpo_get_promo_codes', {})),
    soft(call('silpo_get_my_certificates', { limit: 50, offset: 0 })),
    soft(call('silpo_get_my_delivery_addresses', {}))
  ]);

  const couponList = listOf(coupons?.coupons, coupons?.items, coupons?.businessCoupons).slice(0, 3);
  const couponDetails = await Promise.all(couponList.map((coupon) => {
    const id = coupon.businessCouponId ?? coupon.id;
    return id != null
      ? soft(call('silpo_get_coupon_details', { businessCouponId: Number(id) }))
      : Promise.resolve(coupon);
  }));

  const premiumActive = Boolean(
    premium?.active || premium?.isActive || premium?.subscription?.active || premium?.hasSubscription
  );

  return {
    profile,
    loyalty,
    family: familyHints(family),
    familyRaw: family,
    restrictions: restrictionLabels(restrictions),
    premium: {
      active: premiumActive,
      title: premium?.title || premium?.name || (premiumActive ? 'Плюхс' : 'Плюхс не оформлено'),
      webLink: premium?.webLink || premium?.subscribeWebLink || null,
      mobileLink: premium?.mobileLink || premium?.subscribeMobileLink || null,
      shareWebLink: premium?.shareWebLink || null,
      shareMobileLink: premium?.shareMobileLink || null
    },
    coupons: couponDetails.map((item, i) => item || couponList[i]).filter(Boolean),
    promos: listOf(promos?.promos, promos?.items, promos?.offers),
    promoCodes: listOf(codes?.promoCodes, codes?.items, codes?.codes),
    certificates: listOf(certificates?.certificates, certificates?.items),
    addresses: listOf(addresses?.addresses, addresses?.items, addresses?.deliveryAddresses)
  };
}

export async function personalForStore(call, { branchId, seed }) {
  const ctx = await branchContext(call, branchId);
  const layout = await getLayout(call, branchId, seed || branchId);
  const [favorites, sets, online, offline] = await Promise.all([
    soft(call('silpo_get_my_favorites', {
      branchId,
      deliveryType: ctx.deliveryType,
      timeslotStart: ctx.timeslotStart,
      limit: 40
    })),
    soft(call('silpo_get_product_sets', { branchId, deliveryType: ctx.deliveryType })),
    soft(call('silpo_get_my_online_orders', { limit: 5, offset: 0 })),
    soft(call('silpo_get_my_offline_orders', { ...ctx, limit: 5, offset: 0 }))
  ]);

  const favProducts = withNavigation(listOf(favorites?.products, favorites?.items, favorites?.favorites), layout);
  return {
    favorites: favProducts,
    sets: listOf(sets?.sets, sets?.items, sets?.productSets).map((set) => ({
      slug: set.slug,
      title: set.title || set.name,
      image: set.image || set.imageUrl || null,
      total: set.total || set.productsCount || null
    })).filter((s) => s.slug && s.title),
    onlineOrders: listOf(online?.orders, online?.items).slice(0, 5).map(summarizeOrder),
    offlineOrders: listOf(offline?.orders, offline?.items).slice(0, 5).map(summarizeOrder)
  };
}

function summarizeOrder(order) {
  const products = orderLines(order);
  return {
    id: order.id || order.orderId || order.chequeId || null,
    createdAt: order.createdAt || order.date || order.purchasedAt || null,
    total: order.total || order.amount || order.sum || null,
    count: products.length,
    title: products.slice(0, 3).map((p) => p.name || p.title).filter(Boolean).join(', ')
  };
}

function orderLines(order) {
  return listOf(
    order?.products,
    order?.items,
    (order?.shipments || []).flatMap((s) => s.products || [])
  );
}

export async function productInsight(call, { branchId, slug, productId, companyId, seed }) {
  if (!slug) throw new Error('Потрібен slug товару з каталогу');
  const ctx = await branchContext(call, branchId);
  const layout = await getLayout(call, branchId, seed || branchId);
  const [details, similar, replacements] = await Promise.all([
    call('silpo_get_product_details', { ...ctx, slug }),
    soft(call('silpo_get_similar_products', {
      branchId,
      slug,
      deliveryType: ctx.deliveryType,
      limit: 8
    })),
    productId && companyId
      ? soft(call('silpo_get_replacements', {
        branchId,
        companyId,
        productIds: [productId],
        deliveryType: ctx.deliveryType
      }))
      : null
  ]);

  const similarProducts = withNavigation(listOf(similar?.products, similar?.items, similar?.similar), layout);
  const replacementProducts = withNavigation(
    listOf(replacements?.items, replacements?.products, replacements?.replacements)
      .flatMap((item) => listOf(item?.candidates, item?.products, item?.replacements, item ? [item] : []))
      .filter((p) => p?.id || p?.name),
    layout
  );

  return {
    details: details?.product || details,
    similar: similarProducts,
    replacements: replacementProducts,
    atRisk: Boolean(replacementProducts.length)
  };
}

export async function shelfDetails(call, { branchId, categorySlug, seed }) {
  const ctx = await branchContext(call, branchId);
  const [layout, data, products] = await Promise.all([
    getLayout(call, branchId, seed || branchId),
    call('silpo_get_category', {
      branchId,
      deliveryType: ctx.deliveryType,
      categorySlug
    }),
    soft(call('silpo_get_products', {
      ...ctx,
      category: categorySlug,
      inStock: true,
      limit: 24,
      sortBy: 'popularity'
    }))
  ]);
  return {
    category: data?.category || data,
    products: withNavigation(listOf(products?.products, products?.items), layout)
  };
}

export async function toggleFavorite(call, { productId, externalProductId, toDelete = false }) {
  if (!productId || !externalProductId) throw new Error('Потрібні productId і externalProductId');
  await call('silpo_add_or_update_favorite_products', {
    actions: [{ productId, externalProductId, toDelete: Boolean(toDelete) }]
  });
  return { ok: true, toDelete: Boolean(toDelete) };
}

export async function routeFromSet(call, { branchId, slug, seed }) {
  const ctx = await branchContext(call, branchId);
  const [layout, data] = await Promise.all([
    getLayout(call, branchId, seed || branchId),
    call('silpo_get_products', { ...ctx, set: slug, limit: 40, inStock: true })
  ]);
  return { title: slug, ...routePack(layout, listOf(data?.products, data?.items)) };
}

export async function routeFromFavorites(call, { branchId, seed }) {
  const ctx = await branchContext(call, branchId);
  const [layout, data] = await Promise.all([
    getLayout(call, branchId, seed || branchId),
    call('silpo_get_my_favorites', {
      branchId,
      deliveryType: ctx.deliveryType,
      timeslotStart: ctx.timeslotStart,
      limit: 40
    })
  ]);
  return { title: 'Улюблені', ...routePack(layout, listOf(data?.products, data?.items, data?.favorites)) };
}

export async function routeFromOrder(call, { branchId, seed, source = 'offline' }) {
  const ctx = await branchContext(call, branchId);
  const layout = await getLayout(call, branchId, seed || branchId);
  let products = [];

  if (source === 'online') {
    const data = await call('silpo_get_my_online_orders', { limit: 3, offset: 0 });
    const order = listOf(data?.orders, data?.items)[0];
    if (!order) throw new Error('Онлайн-замовлень ще немає');
    products = orderLines(order).map((line) => line.catalogProduct || line).filter((p) => p?.id || p?.name);
  } else {
    const data = await call('silpo_get_my_offline_orders', { ...ctx, limit: 3, offset: 0 });
    const order = listOf(data?.orders, data?.items)[0];
    if (!order) throw new Error('Покупок у залі за карткою ще немає');
    const resolved = [];
    const missing = [];
    for (const line of orderLines(order)) {
      if (line.catalogProduct) resolved.push(line.catalogProduct);
      else missing.push(String(line.lagerId || line.externalProductId || line.name || '').trim());
    }
    const queries = missing.filter(Boolean).slice(0, 30);
    if (queries.length) {
      const found = await call('silpo_find_products_batch', { ...ctx, products: queries, limit: 1 });
      for (const q of found?.queries || []) {
        if (q.products?.[0]) resolved.push(q.products[0]);
      }
    }
    products = resolved;
  }

  return { title: source === 'online' ? 'Останнє онлайн-замовлення' : 'Останній чек у залі', ...routePack(layout, products) };
}

function haversine(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export async function nearestStores(call, { address, latitude, longitude } = {}) {
  let lat = latitude != null ? Number(latitude) : null;
  let lng = longitude != null ? Number(longitude) : null;
  let resolved = null;

  if ((lat == null || lng == null) && address) {
    const found = await call('silpo_find_address', { address });
    resolved = listOf(found?.addresses, found?.items)[0] || null;
    lat = Number(resolved?.latitude ?? resolved?.lat);
    lng = Number(resolved?.longitude ?? resolved?.lng);
  }

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Не вдалося визначити координати адреси');
  }

  const [delivery, all] = await Promise.all([
    soft(call('silpo_get_available_delivery_types', { latitude: lat, longitude: lng })),
    listStores(call)
  ]);

  const here = { lat, lng };
  const stores = all.stores
    .map((store) => ({
      ...store,
      km: store.latitude && store.longitude
        ? Math.round(haversine(here, { lat: store.latitude, lng: store.longitude }) * 10) / 10
        : null
    }))
    .filter((s) => s.km != null)
    .sort((a, b) => a.km - b.km);

  const types = listOf(delivery?.deliveryTypes, delivery?.items, delivery?.types);
  return {
    latitude: lat,
    longitude: lng,
    resolved,
    deliveryTypes: types.map((t) => ({
      type: t.deliveryType || t.type || t.id,
      branchId: t.branchId || null,
      title: t.title || t.name || t.deliveryType || t.type
    })),
    stores: stores.slice(0, 12)
  };
}

export async function novaPoshtaOffices(call, { city, query }) {
  const settlements = await call('silpo_find_nova_poshta_settlements', { title: city });
  const settlement = listOf(settlements?.settlements, settlements?.items)[0];
  if (!settlement?.id) throw new Error('Місто для «Нової пошти» не знайдено');
  const offices = await call('silpo_find_nova_poshta_offices', {
    settlementId: settlement.id,
    title: query || undefined
  });
  return {
    settlement: { id: settlement.id, title: settlement.title || settlement.name || city },
    offices: listOf(offices?.offices, offices?.items).slice(0, 20).map((office) => ({
      id: office.id,
      number: office.number,
      title: office.title || office.address || `Відділення ${office.number}`,
      type: office.type,
      latitude: office.latitude,
      longitude: office.longitude
    }))
  };
}

export async function setNovaPoshta(call, { office, settlement }) {
  const { id, cart } = await cartPayload(call);
  if (!cart.timeslot || !cart.shipments) {
    throw new Error('У кошику ще немає слота — оберіть доставку в застосунку «Сільпо»');
  }
  await call('silpo_update_shopping_cart', {
    shoppingCartId: id,
    deliveryType: 'NovaPoshta',
    timeslot: cart.timeslot,
    shipments: cart.shipments,
    address: {
      ...(cart.address || {}),
      addressType: 'NovaPoshta',
      settlementId: settlement.id,
      id: office.id,
      number: office.number,
      type: office.type,
      latitude: office.latitude,
      longitude: office.longitude,
      title: office.title
    }
  });
  return cartSummary(await call('silpo_get_shopping_cart_by_id', { shoppingCartId: id }));
}

function validationText(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.message || item.text || item.title || item.description || '';
}

export async function prepareCheckout(call, { branchId, companyId } = {}) {
  const current = await readCart(call);
  if (!current.count) throw new Error('Кошик порожній — спочатку додайте товари');

  try {
    await ensurePickupReady(call, { branchId, companyId });
  } catch (error) {
    return {
      cart: await readCart(call).catch(() => current),
      checkoutUrl: current.checkoutUrl || 'https://silpo.ua/cart',
      ready: false,
      blockers: [error.message]
    };
  }

  const cart = await readCart(call);
  const blockers = cart.validations.map(validationText).filter(Boolean);
  return {
    cart,
    checkoutUrl: cart.checkoutUrl || 'https://silpo.ua/cart',
    ready: blockers.length === 0,
    blockers
  };
}

async function ensurePickupReady(call, { branchId, companyId } = {}) {
  const { id, cart } = await cartPayload(call);
  if (cart.address && cart.timeslot?.start && cart.shipments?.length) return;

  const store = storesCache.stores.find((s) => s.id === (branchId || cart.shipments?.[0]?.branchId));
  const pickupId = store?.id || branchId || cart.shipments?.[0]?.branchId;
  const pickupCompany = store?.companyId || companyId || cart.shipments?.[0]?.companyId;
  if (!pickupId || !pickupCompany) {
    throw new Error('Оберіть магазин — поставлю самовивіз і відкрию оформлення');
  }

  let timeslot = cart.timeslot?.start ? cart.timeslot : null;
  if (!timeslot) {
    const data = await call('silpo_get_time_slots', {
      branchId: pickupId,
      deliveryTypes: ['SelfPickup'],
      limit: 20
    });
    const slots = Array.isArray(data?.slots) ? data.slots : [];
    const slot = slots.find((s) => s.available) || slots[0];
    if (!slot?.start || !slot?.end) {
      throw new Error('Немає вільного слота самовивозу. Довершіть оформлення на silpo.ua');
    }
    timeslot = { start: slot.start, end: slot.end };
  }

  const address = cart.address?.addressType
    ? cart.address
    : {
        addressType: 'self-pickup',
        city: store?.city || '',
        locality: store?.address || store?.city || '',
        street: store?.address || '',
        latitude: store?.latitude != null ? String(store.latitude) : undefined,
        longitude: store?.longitude != null ? String(store.longitude) : undefined
      };

  const shipments = cart.shipments?.length
    ? cart.shipments.map((s) => ({
        companyId: s.companyId || pickupCompany,
        branchId: s.branchId || pickupId
      }))
    : [{ companyId: pickupCompany, branchId: pickupId }];

  await call('silpo_update_shopping_cart', {
    shoppingCartId: id,
    deliveryType: cart.deliveryType || 'SelfPickup',
    timeslot,
    address,
    shipments,
    isAdultConfirmed: true
  });
}
