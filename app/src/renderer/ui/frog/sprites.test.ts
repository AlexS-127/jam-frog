import { describe, expect, it } from 'vitest';
import { GENRE_LOOKS } from './looks';
import { DEFAULT_SPRITES, SPRITE_VERSIONS, spriteUrl } from './sprites';

describe('sprite versions', () => {
  it('finds every sheet of the default version', () => {
    expect(SPRITE_VERSIONS).toContain(DEFAULT_SPRITES);
    for (const file of ['green-frog.png', 'keyboard-frog.png', ...GENRE_LOOKS.map((g) => `genres/${g}.png`)]) {
      expect(spriteUrl(DEFAULT_SPRITES, file)).toMatch(/sprites\/a\//);
    }
  });
  it("falls back to a/'s file when a version doesn't have it", () => {
    expect(spriteUrl('no-such-version', 'genres/jazz.png')).toBe(spriteUrl(DEFAULT_SPRITES, 'genres/jazz.png'));
  });
});
