import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { z } from 'zod';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { NotesModule } from './notes/notes.module.js';
import { PostsModule } from './posts/posts.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: z.object({
        MONGODB_URI: z.string().min(1),
        JWT_SECRET: z
          .string()
          .min(32, 'JWT_SECRET should be at least 32 characters'),
        JWT_EXPIRES_IN: z.string().default('1d'),
        CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
        PORT: z.coerce.number().default(4000),
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    NotesModule,
    PostsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
