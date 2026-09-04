import { createApp } from '../server/app.js';

// Точка входу для Vercel: той самий Express-застосунок як serverless-функція.
const app = createApp();

export default app;
