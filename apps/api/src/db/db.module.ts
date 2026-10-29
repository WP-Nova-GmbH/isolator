import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { createDb } from './client';

export type { Database } from './client';

export const DB = Symbol('DB');
const SQL_CLIENT = Symbol('SQL_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createDb(config.getOrThrow<string>('DATABASE_URL')),
    },
    {
      provide: DB,
      inject: [SQL_CLIENT],
      useFactory: (conn: ReturnType<typeof createDb>) => conn.db,
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly conn: { client: Sql }) {}

  async onApplicationShutdown() {
    await this.conn.client.end();
  }
}
