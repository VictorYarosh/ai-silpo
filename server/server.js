import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Навігатор «Сільпо»: ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}`);
  console.log('Вхід у Сільпо — кнопкою «Увійти» в застосунку (OAuth 2.1 + PKCE).');
});
