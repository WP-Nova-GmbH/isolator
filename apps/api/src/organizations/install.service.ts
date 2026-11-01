import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createUser, passwordInput } from '../auth/auth';
import { DB, type Database } from '../db/db.module';
import { users } from '../db/schema';

export const claimInput = z.object({
  token: z.string().trim().min(1, 'Enter the setup token.'),
  name: z.string().trim().min(1, 'Give your name.'),
  email: z.email('That isn’t an email address.').toLowerCase(),
  password: passwordInput,
});

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

/** Who may claim this install: whoever can read the logs of the server it runs on. */
@Injectable()
export class InstallService implements OnApplicationBootstrap {
  private readonly setupToken = randomBytes(24).toString('base64url');
  private readonly logger = new Logger('Install');

  constructor(@Inject(DB) private readonly db: Database) {}

  async onApplicationBootstrap() {
    if (await this.claimed()) return;
    this.logger.warn(`Nobody has claimed this install. Setup token: ${this.setupToken}`);
  }

  async claimed() {
    const [operator] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isOperator, true));
    return operator !== undefined;
  }

  async claim({ token, ...input }: z.infer<typeof claimInput>) {
    if (await this.claimed()) throw new ConflictException('This install is already claimed.');
    if (!timingSafeEqual(digest(token), digest(this.setupToken))) {
      throw new ForbiddenException('That isn’t the setup token from this install’s logs.');
    }
    await this.db.transaction((tx) => createUser(tx, { ...input, isOperator: true }));
  }
}
