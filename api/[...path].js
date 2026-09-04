import { createApp } from '../server/app.js';

// Vercel: catch-all функція на /api/* — той самий Express-застосунок, що й локально.
const app = createApp();

export default app;
