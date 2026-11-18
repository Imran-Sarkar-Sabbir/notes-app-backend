import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { CurrentUser, Public } from './decorators.js';

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
  interests: z.array(z.string()).optional(),
});
const loginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
const updateMeBody = registerBody
  .pick({ name: true, password: true, interests: true })
  .partial();

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  private async session(user: UserDocument) {
    return {
      token: await this.jwt.signAsync(
        { role: user.role },
        { subject: String(user._id) },
      ),
      user,
    };
  }

  @Public()
  @Post('register')
  async register(
    @Body({ schema: registerBody }) body: z.infer<typeof registerBody>,
  ) {
    return this.session(await this.users.create(body));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginBody }) { email, password }: z.infer<typeof loginBody>,
  ) {
    const user = await this.users.findForLogin(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    return this.session(user);
  }

  @Get('me')
  me(@CurrentUser() me: UserDocument) {
    return me;
  }

  @Patch('me')
  updateMe(
    @CurrentUser() me: UserDocument,
    @Body({ schema: updateMeBody }) body: z.infer<typeof updateMeBody>,
  ) {
    return this.users.update(me._id, body);
  }
}
