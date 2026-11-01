import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Builds the production image and, with --push, publishes it to the container registry:
// npm run create-docker-image -- --push

const rootDir = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const envFile = path.join(rootDir, 'scripts', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values: options } = parseArgs({
  options: {
    push: { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
    platform: { type: 'string' },
    amd64: { type: 'boolean', default: false },
    arm64: { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Checks the macOS keychain, where `docker login` keeps its credentials. */
function isLoggedIn(registry: string) {
  try {
    const credentials: unknown = JSON.parse(
      execFileSync('docker-credential-osxkeychain', ['list'], { encoding: 'utf8', stdio: 'pipe' }),
    );
    return Object.hasOwn(credentials as object, `https://${registry}`);
  } catch {
    return false;
  }
}

function logIn(registry: string) {
  const { DOCKER_REGISTRY_USER: user, DOCKER_REGISTRY_TOKEN: token } = process.env;
  if (!user || !token) {
    fail(`Log in to ${registry} with docker login, or set its user and token in scripts/.env.`);
  }
  const login = spawnSync('docker', ['login', registry, '--username', user, '--password-stdin'], {
    input: token,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (login.status !== 0) fail(`Docker login failed with code ${login.status}.`);
}

function platforms() {
  if (options.amd64) return ['linux/amd64'];
  if (options.arm64) return ['linux/arm64'];
  if (options.platform) return options.platform.split(',');
  if (options.push) return ['linux/amd64', 'linux/arm64'];
  return [`linux/${process.arch === 'arm64' ? 'arm64' : 'amd64'}`];
}

const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const registry = process.env.DOCKER_REGISTRY;
if (options.push && !registry) fail('Set DOCKER_REGISTRY in scripts/.env.');
const image = registry ? `${registry}/isolator` : 'isolator';

if (options.push && !isLoggedIn(registry!)) logIn(registry!);

const targets = platforms();
if (!options.push && targets.length > 1) fail('A local build takes one platform. Use --push.');
console.log(`Building ${image}:${version} for ${targets.join(', ')}`);

const buildArgs = [
  'buildx',
  'build',
  '--pull',
  '--platform',
  targets.join(','),
  '-t',
  `${image}:${version}`,
  '-t',
  `${image}:latest`,
  options.push ? '--push' : '--load',
];
if (options['no-cache']) buildArgs.push('--no-cache');
buildArgs.push('.');

execFileSync('docker', buildArgs, { cwd: rootDir, stdio: 'inherit' });
