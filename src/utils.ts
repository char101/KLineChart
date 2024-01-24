export function getFraction(price: number): number {
  return price < 200 ? 1 : price < 500 ? 2 : price < 2000 ? 5 : price < 5000 ? 10 : 25
}

export function roundPrice(price: number): number {
  if (price < 200) {
    return Math.round(price)
  }
  const fraction = getFraction(price)
  return Math.round(price / fraction) * fraction
}

// create path object for filling and clipping
export function createAreaPath(xs, ys, width, y) {
  const p = new Path2D();
  p.moveTo(0, y);
  for (let i = 0, n = xs.length; i < n; ++i) {
    p.lineTo(xs[i], ys[i]);
  }
  p.lineTo(width, y);
  return p;
}

// fill area where y1 > y2 with color
export function fillPathBetween(ctx, xs, y1, y2, color) {
  if (xs.length === 0) return
  const canvas = ctx.canvas
  ctx.save()
  ctx.fillStyle = color
  ctx.clip(createAreaPath(xs, y1, xs[xs.length - 1], canvas.height))
  ctx.fill(createAreaPath(xs, y2, xs[xs.length - 1], 0))
  ctx.restore()
}
