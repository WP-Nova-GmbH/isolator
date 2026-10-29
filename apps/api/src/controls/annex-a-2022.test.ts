import { describe, expect, it } from 'vitest';
import { ANNEX_A_2022 } from './annex-a-2022';

describe('Annex A 2022 catalog', () => {
  it('contains all 93 controls with unique refs', () => {
    expect(ANNEX_A_2022).toHaveLength(93);
    expect(new Set(ANNEX_A_2022.map((c) => c.ref)).size).toBe(93);
  });

  it('splits into the four 2022 themes', () => {
    const count = (theme: string) => ANNEX_A_2022.filter((c) => c.theme === theme).length;
    expect([count('organizational'), count('people'), count('physical'), count('technological')]).toEqual([37, 8, 14, 34]);
  });
});
