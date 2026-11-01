import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '../auth/auth';
import { AUTH } from '../auth/auth.module';
import { DB, type Database } from '../db/db.module';
import { members, organizations, users } from '../db/schema';

export interface CurrentMember {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
}

/** Someone signed in, who may not be a Member of anything yet, such as a new Operator. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isOperator: boolean;
  sessionId: string;
  activeOrganizationId: string | null;
}

interface SignedInRequest {
  headers: IncomingHttpHeaders;
  user?: CurrentUser;
  member?: CurrentMember;
}

async function signedInUser(auth: Auth, db: Database, request: SignedInRequest) {
  const found = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!found) throw new UnauthorizedException('Sign in first.');
  const [{ isOperator }] = await db
    .select({ isOperator: users.isOperator })
    .from(users)
    .where(eq(users.id, found.user.id));
  return {
    id: found.user.id,
    name: found.user.name,
    email: found.user.email,
    isOperator,
    sessionId: found.session.id,
    activeOrganizationId: found.session.activeOrganizationId ?? null,
  };
}

@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SignedInRequest>();
    request.user = await signedInUser(this.auth, this.db, request);
    return true;
  }
}

/** Lets through a signed-in Member, in the Organization their browser is working in. */
@Injectable()
export class MemberGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SignedInRequest>();
    const user = await signedInUser(this.auth, this.db, request);
    const memberships = await this.db
      .select({
        id: members.id,
        organizationId: members.organizationId,
        organizationName: organizations.name,
      })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, user.id), isNull(members.removedAt)))
      .orderBy(asc(members.createdAt));
    const membership =
      memberships.find(({ organizationId }) => organizationId === user.activeOrganizationId) ??
      memberships[0];
    if (!membership) throw new ForbiddenException('You are not a Member of an Organization yet.');
    request.user = user;
    request.member = { ...membership, name: user.name, email: user.email };
    return true;
  }
}

export const Member = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<SignedInRequest>().member!;
});

export const User = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<SignedInRequest>().user!;
});
