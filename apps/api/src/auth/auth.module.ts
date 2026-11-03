import { Global, Module } from '@nestjs/common';
import { createAuth } from './auth';

export const AUTH = Symbol('AUTH');

@Global()
@Module({
  providers: [{ provide: AUTH, useFactory: () => createAuth() }],
  exports: [AUTH],
})
export class AuthModule {}
