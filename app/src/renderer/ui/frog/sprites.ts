/// <reference types="vite/client" />

// The frog's artwork, one folder per version under sprites/ (see sprites/README.md): a/ is what the app shows.
// Another version (b/, …) can be loaded with the frog controller's setSprites() for an A/B test; there is no
// picker in the app. A file a version doesn't have falls back to a/'s.

const FILES = import.meta.glob<string>('./sprites/*/**/*.png', { eager: true, query: '?url', import: 'default' });

export const DEFAULT_SPRITES = 'a';

/** The sprite versions there are: the folders under sprites/ that hold at least one PNG. */
export const SPRITE_VERSIONS: string[] = [...new Set(Object.keys(FILES).map((path) => path.split('/')[2]))].sort();

/** The URL of a sprite file (e.g. "green-frog.png", "genres/jazz.png") in a version, else in a/. */
export function spriteUrl(version: string, file: string): string {
  return FILES[`./sprites/${version}/${file}`] ?? FILES[`./sprites/${DEFAULT_SPRITES}/${file}`];
}
