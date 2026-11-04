import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';
import { startSession, type Auth } from '../auth/auth';
import { AUTH } from '../auth/auth.module';
import { DB, type Database } from '../db/db.module';
import { members, organizations, sessions, users } from '../db/schema';

export type Role = (typeof members.$inferSelect)['role'];

export interface CurrentMember {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
  role: Role;
}

const ROLES = 'roles';
const EVERYONE: Role[] = ['administrator', 'editor', 'reviewer', 'auditor'];
const EDITORS: Role[] = ['administrator', 'editor'];

/**
 * Who may use a route, in place of the default: every Member may read, and Administrators and
 * Editors may change things. Reviewers are added where a route records a person's decision.
 */
export const AllowedFor = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** For a decision a named person gives: a Confirmation, or a risk owner closing their risk. */
export const ReviewersAllowed = () => AllowedFor('administrator', 'editor', 'reviewer');

/** For managing Members and the Organization's settings. */
export const AdministratorsOnly = () => AllowedFor('administrator');

function refusal(role: Role, allowed: Role[]) {
  if (allowed.length === 1 && allowed[0] === 'administrator') {
    return 'Only an Administrator can do this.';
  }
  if (role === 'auditor') return 'As an Auditor you can read this ISMS, but not change it.';
  if (role === 'reviewer') return 'As a Reviewer you can give Confirmations, but not change records.';
  return 'Your role doesn’t allow this.';
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

/**
 * Lets through a signed-in Member, in the Organization their browser is working in, if their role
 * allows the route. See AllowedFor.
 */
@Injectable()
export class MemberGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Database,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SignedInRequest & { method: string }>();
    const user = await signedInUser(this.auth, this.db, request);
    const memberships = await this.db
      .select({
        id: members.id,
        organizationId: members.organizationId,
        organizationName: organizations.name,
        role: members.role,
      })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, user.id), isNull(members.removedAt)))
      .orderBy(asc(members.createdAt));
    const membership =
      memberships.find(({ organizationId }) => organizationId === user.activeOrganizationId) ??
      memberships[0];
    if (!membership) throw new ForbiddenException('You are not a Member of an Organization yet.');
    const allowed =
      this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? (['GET', 'HEAD'].includes(request.method) ? EVERYONE : EDITORS);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException(refusal(membership.role, allowed));
    }
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
