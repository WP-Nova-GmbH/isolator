import { signJwt } from '@clerk/backend/jwt';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const other = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const env = {
  CLERK_SECRET_KEY: 'sk_test_unused',
  CLERK_PUBLISHABLE_KEY: 'pk_test_dW51c2VkLmNsZXJrLmFjY291bnRzLmRldiQ',
  CLERK_JWT_KEY: publicKey,
  APP_URL: 'https://isolator.example.com',
};
const auth = createAuth(env);

async function token(claims: Record<string, unknown> = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const signed = await signJwt(
    {
      sid: 'sess_1',
      sub: 'user_1',
      iss: 'https://example.clerk.accounts.dev',
      azp: env.APP_URL,
      iat: now,
      nbf: now - 5,
      exp: now + 60,
      ...claims,
    },
    key,
    { algorithm: 'RS256', header: { typ: 'JWT', kid: randomUUID() } },
  );
  return `Bearer ${signed}`;
}

describe('a Clerk session token', () => {
  it('gives the session and who it belongs to', async () => {
    await expect(auth.session(await token())).resolves.toEqual({
      id: 'sess_1',
      clerkUserId: 'user_1',
    });
  });

  it('is needed', async () => {
    await expect(auth.session(undefined)).resolves.toBeNull();
    await expect(auth.session('Basic abc')).resolves.toBeNull();
    await expect(auth.session('Bearer not-a-token')).resolves.toBeNull();
  });

  it('must be signed by this Clerk instance', async () => {
    await expect(auth.session(await token({}, other.privateKey))).resolves.toBeNull();
  });

  it('must not have expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(auth.session(await token({ iat: past, exp: past + 60 }))).resolves.toBeNull();
  });

  it('must come from this install’s address', async () => {
    await expect(auth.session(await token({ azp: 'https://elsewhere.example' }))).resolves.toBeNull();
  });
});

describe('creating it', () => {
  it('needs the Clerk keys', () => {
    expect(() => createAuth({ ...env, CLERK_SECRET_KEY: '' })).toThrow('CLERK_SECRET_KEY');
  });

  it('needs APP_URL in production, and not in development', () => {
    expect(() => createAuth({ ...env, APP_URL: '', NODE_ENV: 'production' })).toThrow('APP_URL');
    expect(() => createAuth({ ...env, APP_URL: '' })).not.toThrow();
  });
});
