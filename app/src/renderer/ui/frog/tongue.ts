export interface TonguePose { reach: number; open: number }

/** The three-frame action is: neutral idle, half-out tongue, full-out tongue. */
export function tonguePose(frame: number): TonguePose | null {
  if (frame <= 0) return null;
  return { reach: frame === 1 ? 0.5 : 1, open: 1 };
}

/** Draw the open mouth and centered tongue; `top` is the mouth line, `pixel` is the art's pixel size. */
export function drawTongue(context: CanvasRenderingContext2D, center: number, top: number, pixel: number, pose: TonguePose): void {
  const opening = Math.max(1, Math.round(pixel * pose.open));
  const length = Math.max(2, Math.round(pixel * 5 * pose.reach));
  const width = Math.max(3, Math.round(pixel * 3.6));
  const left = Math.round(center - width / 2);
  const corner = Math.min(pixel, Math.floor(length / 2));
  if (length > 1) {
    context.fillStyle = '#663f36';
    context.fillRect(left, top, width, length - corner);
    context.fillRect(left + corner, top + length - corner, width - corner * 2, corner);
    context.fillStyle = '#d97980';
    context.fillRect(left + 1, top, width - 2, Math.max(0, length - corner - 1));
    context.fillRect(left + corner + 1, top + length - corner, width - corner * 2 - 2, Math.max(0, corner - 1));
    context.fillStyle = '#f39b9e';
    context.fillRect(left + 1, top + 1, 1, Math.max(0, length - corner - 3));
    context.fillStyle = '#99505a';
    context.fillRect(center, top, 1, Math.round(length * 0.4));
  }
  context.fillStyle = '#191b13';
  context.fillRect(center - pixel * 3, top - opening, pixel * 6, opening);
}
