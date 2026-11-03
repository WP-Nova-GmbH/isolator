import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';
import { startSession, type Auth } from '../auth/auth';
import { AUTH } from '../auth/auth.module';
import { DB, type Database } from '../db/db.module';
import { members, organizations, sessions, users } from '../db/schema';

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

async function signedInUser(
  auth: Auth,
  db: Database,
  request: SignedInRequest,
): Promise<CurrentUser> {
  const session = await auth.session(request.headers.authorization);
  if (!session) throw new UnauthorizedException('Sign in first.');
  const [known] = await db
    .select({ user: users, activeOrganizationId: sessions.activeOrganizationId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, session.id));
  const user = known?.user ?? (await startSession(auth, db, session));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isOperator: user.isOperator,
    sessionId: session.id,
    activeOrganizationId: known?.activeOrganizationId ?? null,
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
