import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { MongoExceptionFilter } from './common/mongo-exception.filter.js';

export async function setupApp(app: INestApplication) {
  const origins = app
    .get(ConfigService)
    .getOrThrow<string>('CLIENT_ORIGIN')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new MongoExceptionFilter());

  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(Object.values(connection.models).map((m) => m.init()));
  return app;
}
