import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
app.listen(env.port, () => console.log(`SIMPEG backend listening on :${env.port}`));
