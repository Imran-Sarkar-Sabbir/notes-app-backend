import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongoMemoryServer } from 'mongodb-memory-server';

export async function startInMemoryApp(): Promise<{
  app: INestApplication;
  stop: () => Promise<void>;
}> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET ||= 'local-only-secret-that-is-at-least-32-chars';

  const { AppModule } = await import('./app.module.js');
  const { setupApp } = await import('./app.setup.js');
  const app = await setupApp(
    await NestFactory.create(AppModule, { logger: ['error', 'warn'] }),
  );
  await app.init();

  return {
    app,
    stop: async () => {
      await app.close();
      await mongod.stop();
    },
  };
}
