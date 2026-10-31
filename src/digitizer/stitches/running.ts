import {
  cumulative,
  dedupe,
  dist,
  normalize,
  pointAt,
  sub,
  type Pt,
} from "../geometry";

/** Angle (radians) au-delà duquel un sommet est conservé comme angle vif. */
const CORNER_ANGLE = (35 * Math.PI) / 180;

/** Découpe une polyligne aux angles vifs. */
export function splitAtCorners(pts: Pt[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    cur.push(pts[i]);
    const a = normalize(sub(pts[i], pts[i - 1]));
    const b = normalize(sub(pts[i + 1], pts[i]));
    const ang = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
    if (ang > CORNER_ANGLE) {
      out.push(cur);
      cur = [pts[i]];
    }
  }
  cur.push(pts[pts.length - 1]);
  out.push(cur);
  return out;
}

/**
 * Rééchantillonne une polyligne en points de longueur ≈ `length`,
 * en conservant les angles vifs. Renvoie la liste des pénétrations (premier point inclus).
 */
export function resampleRunning(
  input: Pt[],
  length: number,
  closed = false,
): Pt[] {
  let pts = dedupe(input);
  if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) > 1e-6)
    pts = [...pts, pts[0]];
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (const piece of splitAtCorners(pts)) {
    const cum = cumulative(piece);
    const total = cum[cum.length - 1];
    if (total < 1e-6) continue;
    const n = Math.max(1, Math.round(total / length));
    for (let i = 1; i <= n; i++) out.push(pointAt(piece, cum, (total * i) / n));
  }
  return out;
}

/** Point droit avec répétitions (aller-retour) et point triple. */
export function runningStitch(
  pts: Pt[],
  opts: { length: number; repeats: number; bean: number; closed?: boolean },
): Pt[] {
  const base = resampleRunning(pts, Math.max(0.3, opts.length), opts.closed);
  if (base.length < 2) return base;
  let path: Pt[] = [];
  for (let r = 0; r < Math.max(1, opts.repeats); r++) {
    const pass = r % 2 === 0 ? base : [...base].reverse();
    path = path.length ? path.concat(pass.slice(1)) : pass.slice();
  }
  if (opts.bean > 0) {
    const bean: Pt[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      bean.push(path[i]);
      for (let k = 0; k < opts.bean; k += 2) bean.push(path[i - 1], path[i]);
    }
    path = bean;
  }
  return path;
}
