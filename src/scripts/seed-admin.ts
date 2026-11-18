import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { UsersService } from '../users/users.service.js';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Admin' } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD first');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
const users = app.get(UsersService);

const existing = await users.findForLogin(ADMIN_EMAIL);
const admin = existing
  ? await users.update(existing._id, {
      role: 'admin',
      password: ADMIN_PASSWORD,
    })
  : await users.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    });

console.log(`Admin ready: ${admin.email}`);
await app.close();
