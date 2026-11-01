import { Global, Module } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { createAuth } from './auth';

export const AUTH = Symbol('AUTH');

@Global()
@Module({
  providers: [
    { provide: AUTH, inject: [DB], useFactory: (db: Database) => createAuth(db) },
  ],
  exports: [AUTH],
})
export class AuthModule {}
