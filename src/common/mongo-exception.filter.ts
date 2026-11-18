import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import mongoose from 'mongoose';

@Catch(mongoose.Error.ValidationError, mongoose.mongo.MongoServerError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(
    err: mongoose.Error.ValidationError | mongoose.mongo.MongoServerError,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();

    if (err instanceof mongoose.Error.ValidationError) {
      const message = Object.values(err.errors).map((e) => e.message);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: 400, error: 'Bad Request', message });
    }
    if (err.code === 11000) {
      return res.status(HttpStatus.CONFLICT).json({
        statusCode: 409,
        error: 'Conflict',
        message: 'That email is already registered',
      });
    }
    console.error(err);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong',
    });
  }
}
