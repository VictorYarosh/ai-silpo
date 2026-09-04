import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SilpoAuthProvider } from './session.js';

export const MCP_URL = process.env.MCP_URL || 'https://mcp.silpo.ua/mcp';

// Теплі підключення на процес: у serverless живуть у межах одного інстансу.
const pool = new Map();
const POOL_TTL = 10 * 60 * 1000;

export class NeedsAuthError extends Error {
  constructor(authUrl) {
    super('needs_auth');
    this.needsAuth = true;
    this.authUrl = authUrl || null;
  }
}

export function isAuthError(error) {
  if (error?.needsAuth) return true;
  const message = String(error?.message || error);
  return /invalid_token|Unauthorized|401|invalid_grant/i.test(message);
}

function unwrap(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const text = result.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return result;
}

function poolKey(token) {
  return token ? token.slice(-32) : null;
}

export function createProvider(session, redirectUrl) {
  return new SilpoAuthProvider(redirectUrl, session);
}

export async function connect(session, redirectUrl) {
  const provider = createProvider(session, redirectUrl);

  // Без токенів не стартуємо OAuth самі: інакше кожен запит згенерував би новий
  // code_verifier і зламав уже відкриту сторінку входу (PKCE).
  if (!provider.hasTokens()) {
    throw new NeedsAuthError(session.data.authUrl);
  }

  const key = poolKey(provider.tokens()?.access_token);
  const cached = key && pool.get(key);

  if (cached && Date.now() - cached.at < POOL_TTL) {
    return cached.mcp;
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const client = new Client({ name: 'silpo-store-navigator', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
  } catch (error) {
    if (provider.authorizationUrl) throw new NeedsAuthError(provider.authorizationUrl);
    throw error;
  }

  const { tools } = await client.listTools();

  const mcp = {
    tools,
    async call(name, args = {}) {
      try {
        return unwrap(await client.callTool({ name, arguments: args }));
      } catch (error) {
        if (isAuthError(error)) {
          const freshKey = poolKey(provider.tokens()?.access_token);
          if (freshKey) pool.delete(freshKey);
          throw new NeedsAuthError(provider.authorizationUrl);
        }
        throw error;
      }
    }
  };

  const newKey = poolKey(provider.tokens()?.access_token);
  if (newKey) pool.set(newKey, { mcp, at: Date.now() });
  return mcp;
}

/** Завершує OAuth-потік: обмінює code на токени в межах сесії гостя. */
export async function finishAuth(session, redirectUrl, code) {
  const provider = createProvider(session, redirectUrl);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  await transport.finishAuth(code);

  delete session.data.authUrl;
  delete session.data.verifier;
  session.dirty = true;

  const key = poolKey(provider.tokens()?.access_token);
  if (key) pool.delete(key);
}

/** Стартує OAuth-потік і повертає URL сторінки входу «Сільпо». */
export async function startAuth(session, redirectUrl) {
  const provider = createProvider(session, redirectUrl);
  provider.invalidateCredentials('all');

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const client = new Client({ name: 'silpo-store-navigator', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    return null;
  } catch (error) {
    if (!provider.authorizationUrl) throw error;
    session.data.authUrl = provider.authorizationUrl;
    session.dirty = true;
    return provider.authorizationUrl;
  }
}
