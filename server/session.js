import { createHmac } from 'crypto';

const COOKIE = 'silpo_sess';
const CHUNK = 3000;
const MAX_CHUNKS = 8;
const SECRET = process.env.SESSION_SECRET || 'silpo-navigator-dev-secret';

function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

/**
 * Сесія живе у підписаному cookie, тому сервер не тримає стану —
 * це працює і локально, і в serverless (Vercel), і одночасно для різних гостей.
 */
export function readSession(req) {
  const cookies = parseCookies(req.headers?.cookie);
  let raw = '';
  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    const chunk = cookies[`${COOKIE}${i}`];
    if (!chunk) break;
    raw += chunk;
  }

  const session = { data: {}, dirty: false };
  if (!raw) return session;

  const [payload, mac] = raw.split('~');
  if (!payload || !mac || sign(payload) !== mac) return session;

  try {
    session.data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    session.data = {};
  }
  return session;
}

export function commitSession(res, session) {
  if (!session?.dirty || res.headersSent) return;

  const payload = Buffer.from(JSON.stringify(session.data)).toString('base64url');
  const raw = `${payload}~${sign(payload)}`;
  const chunks = raw.match(new RegExp(`.{1,${CHUNK}}`, 'g')) || [];
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const headers = chunks.map(
    (chunk, i) => `${COOKIE}${i}=${chunk}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
  );
  for (let i = chunks.length; i < MAX_CHUNKS; i += 1) {
    headers.push(`${COOKIE}${i}=; Path=/; Max-Age=0`);
  }

  res.setHeader('Set-Cookie', headers);
  session.dirty = false;
}

export class SilpoAuthProvider {
  constructor(redirectUrl, session) {
    this._redirectUrl = redirectUrl;
    this.session = session;
    this.authorizationUrl = null;
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return {
      client_name: 'Silpo Store Navigator',
      client_uri: 'https://github.com/VictorYarosh/ai-silpo',
      redirect_uris: [this._redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    };
  }

  _set(key, value) {
    this.session.data[key] = value;
    this.session.dirty = true;
  }

  clientInformation() {
    return this.session.data.client;
  }

  saveClientInformation(client) {
    this._set('client', client);
  }

  tokens() {
    return this.session.data.tokens;
  }

  saveTokens(tokens) {
    this._set('tokens', tokens);
  }

  saveCodeVerifier(verifier) {
    this._set('verifier', verifier);
  }

  codeVerifier() {
    const verifier = this.session.data.verifier;
    if (!verifier) throw new Error('Сесію авторизації втрачено — почніть вхід заново');
    return verifier;
  }

  redirectToAuthorization(url) {
    this.authorizationUrl = url.toString();
  }

  hasTokens() {
    return Boolean(this.session.data.tokens?.access_token);
  }

  invalidateCredentials(scope) {
    if (scope === 'all') {
      this.session.data = {};
    } else if (scope === 'tokens') {
      delete this.session.data.tokens;
    } else if (scope === 'client') {
      delete this.session.data.client;
    } else if (scope === 'verifier') {
      delete this.session.data.verifier;
    }
    this.session.dirty = true;
  }
}
