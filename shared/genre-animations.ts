// Each generated sheet has four columns and four rows, with transparent gutters
// of different widths. These measured cuts keep neighboring poses out of view.
export const GENRE_ANIMATIONS = {
  jazz: { width: 1302, height: 1208, x: [0, 345, 670, 999, 1302], y: [0, 315, 612, 902, 1208], mouth: [0.49, 0.43] },
  rock: { width: 1278, height: 1230, x: [0, 336, 649, 973, 1278], y: [0, 315, 626, 925, 1230], mouth: [0.47, 0.40] },
  punk: { width: 1312, height: 1199, x: [0, 356, 670, 991, 1312], y: [0, 325, 626, 905, 1199], mouth: [0.49, 0.39] },
  alternative: { width: 1312, height: 1199, x: [0, 355, 678, 1006, 1312], y: [0, 332, 629, 902, 1199], mouth: [0.49, 0.40] },
  pop: { width: 1312, height: 1199, x: [0, 338, 667, 995, 1312], y: [0, 317, 606, 891, 1199], mouth: [0.50, 0.40] },
  country: { width: 1312, height: 1199, x: [0, 359, 668, 983, 1312], y: [0, 321, 613, 892, 1199], mouth: [0.50, 0.39] },
  electronic: { width: 1312, height: 1199, x: [0, 339, 655, 973, 1312], y: [0, 322, 592, 859, 1199], mouth: [0.50, 0.40] },
  rap: { width: 1312, height: 1199, x: [0, 330, 658, 982, 1312], y: [0, 308, 606, 897, 1199], mouth: [0.50, 0.40] },
} as const;

export type GenreLook = keyof typeof GENRE_ANIMATIONS;
export const GENRE_LOOKS = Object.keys(GENRE_ANIMATIONS) as GenreLook[];
export const GENRE_FRAME_COUNT = 8;

export function genreFrame(look: GenreLook, index: number) {
  const sheet = GENRE_ANIMATIONS[look];
  const column = index % 4;
  const row = Math.floor(index / 4);
  // A narrow inner gutter excludes isolated pixels at the left and top where
  // neighboring generated poses meet without clipping a guitar headstock.
  const inset = 8;
  return {
    x: sheet.x[column] + inset, y: sheet.y[row] + inset,
    width: sheet.x[column + 1] - sheet.x[column] - inset,
    height: sheet.y[row + 1] - sheet.y[row] - inset,
  };
}

export function genreFrameSize(look: GenreLook) {
  const sheet = GENRE_ANIMATIONS[look];
  return {
    width: Math.max(...sheet.x.slice(1).map((edge, i) => edge - sheet.x[i])),
    height: Math.max(...sheet.y.slice(1).map((edge, i) => edge - sheet.y[i])),
  };
}
