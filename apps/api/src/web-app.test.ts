import { describe, expect, it } from 'vitest';
import { servesWebApp } from './web-app';

describe('opening a link directly', () => {
  it.each(['/', '/assets', '/assets/new', '/assets/3f0c2a4e', '/soa/A.5.1', '/risks/R-01'])(
    'opens the web app at %s',
    (path) => expect(servesWebApp(path)).toBe(true),
  );

  it.each(['/api', '/api/assets', '/static/index-abc123.js', '/static/missing.css'])(
    'leaves %s to the API or the build folder',
    (path) => expect(servesWebApp(path)).toBe(false),
  );
});
