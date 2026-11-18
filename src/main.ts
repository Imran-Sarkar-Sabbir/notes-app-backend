import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';

async function bootstrap() {
  const app = await setupApp(await NestFactory.create(AppModule));
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
await bootstrap();
