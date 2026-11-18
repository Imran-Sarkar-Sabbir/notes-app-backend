import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserDocument } from '../users/user.schema.js';
import { Roles } from './decorators.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride(Roles, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;

    const { user } = ctx.switchToHttp().getRequest<{ user?: UserDocument }>();
    if (!user || !roles.includes(user.role))
      throw new ForbiddenException('Not allowed');
    return true;
  }
}
