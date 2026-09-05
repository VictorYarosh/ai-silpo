import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { connect, finishAuth, isAuthError, startAuth } from './mcp.js';
import { commitSession, readSession } from './session.js';
import {
  USED_TOOLS,
  addToCart,
  applyCertificates,
  clearCart,
  getLayout,
  listStores,
  nearestStores,
  novaPoshtaOffices,
  personalForStore,
  productInsight,
  promosOnTheWay,
  readCart,
  readProfile,
  removeFromCart,
  routeFromFavorites,
  routeFromOrder,
  routeFromSet,
  searchList,
  searchProduct,
  setNovaPoshta,
  shelfDetails,
  toggleFavorite,
  updateCart
} from './silpo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
  }));

  const redirectUrl = (req) => {
    const base = process.env.PUBLIC_URL
      || (req.headers['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host']}`
        : `${req.protocol}://${req.headers.host}`);
    return `${base.replace(/\/$/, '')}/api/oauth/callback`;
  };

  /** Кожен запит працює у власній cookie-сесії гостя: сервер стану не тримає. */
  function route(handler) {
    return async (req, res) => {
      const session = readSession(req);
      try {
        const mcp = await connect(session, redirectUrl(req));
        const data = await handler({ req, mcp, call: mcp.call, session });
        commitSession(res, session);
        res.json({ success: true, ...data });
      } catch (error) {
        commitSession(res, session);
        const needsAuth = isAuthError(error);
        if (!needsAuth) console.error(`${req.path}:`, error.message);
        res.status(needsAuth ? 401 : 500).json({
          success: false,
          needsAuth,
          authUrl: error.authUrl || null,
          error: needsAuth ? 'Потрібна авторизація в «Сільпо»' : error.message
        });
      }
    };
  }

  app.get('/api/mcp/status', async (req, res) => {
    const session = readSession(req);
    try {
      const mcp = await connect(session, redirectUrl(req));
      commitSession(res, session);
      res.json({ connected: true, toolsCount: mcp.tools.length, usedTools: USED_TOOLS.length });
    } catch (error) {
      commitSession(res, session);
      res.json({
        connected: false,
        needsAuth: true,
        authUrl: error.authUrl || null,
        error: error.message
      });
    }
  });

  app.get('/api/mcp/tools', route(async ({ mcp }) => ({
    count: mcp.tools.length,
    used: USED_TOOLS,
    tools: mcp.tools.map((tool) => ({ name: tool.name, description: tool.description }))
  })));

  app.post('/api/mcp/auth', async (req, res) => {
    const session = readSession(req);
    try {
      const authUrl = await startAuth(session, redirectUrl(req));
      commitSession(res, session);
      res.json({ success: true, connected: !authUrl, authUrl });
    } catch (error) {
      commitSession(res, session);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/oauth/callback', async (req, res) => {
    const session = readSession(req);
    const page = (title, text, ok) => `<!doctype html><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <body style="font-family:-apple-system,sans-serif;background:#FFF7EA;margin:0;display:grid;place-items:center;height:100vh">
      <div style="background:#fff;padding:28px;border-radius:20px;text-align:center;max-width:320px;border:1px solid #E6DCD0">
      <h2 style="margin:0 0 8px;color:${ok ? '#FE860F' : '#E60016'}">${title}</h2>
      <p style="margin:0;color:#6B5A4D;font-size:14px">${text}</p>
      <script>setTimeout(()=>{window.close();location.replace('/')},1200)</script></div></body>`;

    try {
      const code = String(req.query.code || '');
      if (!code) throw new Error('Немає параметра code');
      await finishAuth(session, redirectUrl(req), code);
      commitSession(res, session);
      res.send(page('Готово', '«Сільпо» підключено. Можна закривати вкладку.', true));
    } catch (error) {
      commitSession(res, session);
      console.error('oauth/callback:', error.message);
      res.status(500).send(page('Помилка входу', error.message, false));
    }
  });

  app.get('/api/stores', route(({ req, call }) =>
    listStores(call, { q: req.query.q, city: req.query.city })));

  app.get('/api/layout', route(({ req, call }) => {
    const branchId = String(req.query.branchId || '');
    if (!branchId) throw new Error('Потрібен branchId');
    return getLayout(call, branchId, String(req.query.seed || branchId)).then((layout) => ({ layout }));
  }));

  app.post('/api/search', route(({ req, call }) => {
    const { branchId, query, seed } = req.body || {};
    if (!branchId || !String(query || '').trim()) throw new Error('Потрібні branchId і query');
    return searchProduct(call, { branchId, query: String(query).trim(), seed });
  }));

  app.post('/api/list-search', route(({ req, call }) => {
    const { branchId, items, seed } = req.body || {};
    const list = (Array.isArray(items) ? items : String(items || '').split(/[,;\n]/))
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 30);
    if (!branchId || !list.length) throw new Error('Потрібні branchId і список товарів');
    return searchList(call, { branchId, items: list, seed });
  }));

  app.post('/api/on-the-way', route(({ req, call }) => {
    const { branchId, seed, route: path, skipShelfIds } = req.body || {};
    if (!branchId || !Array.isArray(path) || path.length < 2) throw new Error('Потрібні branchId і маршрут');
    return promosOnTheWay(call, { branchId, seed, route: path, skipShelfIds });
  }));

  app.get('/api/me', route(({ call }) => readProfile(call)));

  app.get('/api/personal', route(({ req, call }) => {
    const branchId = String(req.query.branchId || '');
    if (!branchId) throw new Error('Потрібен branchId');
    return personalForStore(call, { branchId, seed: req.query.seed });
  }));

  app.post('/api/nearest', route(({ req, call }) => {
    const { address, latitude, longitude } = req.body || {};
    if (!address && (latitude == null || longitude == null)) throw new Error('Потрібна адреса або координати');
    return nearestStores(call, { address, latitude, longitude });
  }));

  app.post('/api/product', route(({ req, call }) => {
    const { branchId, slug, productId, companyId, seed } = req.body || {};
    if (!branchId || !slug) throw new Error('Потрібні branchId і slug');
    return productInsight(call, { branchId, slug, productId, companyId, seed });
  }));

  app.get('/api/shelf', route(({ req, call }) => {
    const branchId = String(req.query.branchId || '');
    const categorySlug = String(req.query.slug || '');
    if (!branchId || !categorySlug) throw new Error('Потрібні branchId і slug відділу');
    return shelfDetails(call, {
      branchId,
      categorySlug,
      seed: req.query.seed
    });
  }));

  app.post('/api/favorites', route(({ req, call }) => {
    const { productId, externalProductId, toDelete } = req.body || {};
    return toggleFavorite(call, { productId, externalProductId, toDelete });
  }));

  app.post('/api/route/set', route(({ req, call }) => {
    const { branchId, slug, seed } = req.body || {};
    if (!branchId || !slug) throw new Error('Потрібні branchId і slug набору');
    return routeFromSet(call, { branchId, slug, seed });
  }));

  app.post('/api/route/favorites', route(({ req, call }) => {
    const { branchId, seed } = req.body || {};
    if (!branchId) throw new Error('Потрібен branchId');
    return routeFromFavorites(call, { branchId, seed });
  }));

  app.post('/api/route/repeat', route(({ req, call }) => {
    const { branchId, seed, source } = req.body || {};
    if (!branchId) throw new Error('Потрібен branchId');
    return routeFromOrder(call, { branchId, seed, source });
  }));

  app.get('/api/cart', route(async ({ call }) => ({ cart: await readCart(call) })));

  app.post('/api/cart/add', route(async ({ req, call }) => {
    const { branchId, productId, companyId, quantity } = req.body || {};
    if (!branchId || !productId) throw new Error('Потрібні branchId і productId');
    return { cart: await addToCart(call, { branchId, productId, companyId, quantity }) };
  }));

  app.post('/api/cart/remove', route(async ({ req, call }) => {
    const { productId } = req.body || {};
    if (!productId) throw new Error('Потрібен productId');
    return { cart: await removeFromCart(call, { productId }) };
  }));

  app.post('/api/cart/clear', route(async ({ call }) => ({ cart: await clearCart(call) })));

  app.post('/api/cart/update', route(async ({ req, call }) => {
    const { promoCode, bonusRequested, isAdultConfirmed, deliveryType } = req.body || {};
    return { cart: await updateCart(call, { promoCode, bonusRequested, isAdultConfirmed, deliveryType }) };
  }));

  app.post('/api/cart/certificates', route(async ({ req, call }) => {
    const { certificatesToAdd, certificatesToRemove } = req.body || {};
    return { cart: await applyCertificates(call, { certificatesToAdd, certificatesToRemove }) };
  }));

  app.post('/api/novaposhta', route(({ req, call }) => {
    const { city, query } = req.body || {};
    if (!city) throw new Error('Потрібна назва міста');
    return novaPoshtaOffices(call, { city, query });
  }));

  app.post('/api/novaposhta/apply', route(async ({ req, call }) => {
    const { office, settlement } = req.body || {};
    if (!office?.id || !settlement?.id) throw new Error('Оберіть відділення «Нової пошти»');
    return { cart: await setNovaPoshta(call, { office, settlement }) };
  }));

  return app;
}
