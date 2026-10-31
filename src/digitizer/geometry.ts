/**
 * Outils géométriques de base pour le module de préparation (numérisation).
 * Toutes les coordonnées sont exprimées en millimètres.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Matrice affine SVG [a b c d e f] : x' = a·x + c·y + e ; y' = b·x + d·y + f */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function apply(m: Matrix, p: Pt): Pt {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}

/** Facteur d'échelle moyen d'une matrice (pour convertir une épaisseur de trait). */
export function meanScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

export function normalize(v: Pt): Pt {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

export function rotate(p: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function polylineLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Supprime les points consécutifs quasi identiques. */
export function dedupe(pts: Pt[], eps = 1e-4): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  }
  return out;
}

/** Point à une abscisse curviligne donnée. */
export function pointAt(pts: Pt[], cum: number[], s: number): Pt {
  if (s <= 0) return pts[0];
  const total = cum[cum.length - 1];
  if (s >= total) return pts[pts.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  return lerp(pts[lo], pts[hi], seg > 0 ? (s - cum[lo]) / seg : 0);
}

export function cumulative(pts: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}

/** Aire signée d'un anneau (positive = sens horaire en repère y vers le bas). */
export function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  }
  return a / 2;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Iterable<Pt>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Intersection stricte de deux segments [a,b] et [c,d]. */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(sub(d, c), sub(a, c));
  const d2 = cross(sub(d, c), sub(b, c));
  const d3 = cross(sub(b, a), sub(c, a));
  const d4 = cross(sub(b, a), sub(d, a));
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}

export const cross = (u: Pt, v: Pt) => u.x * v.y - u.y * v.x;

/** Point dans un ensemble d'anneaux (règle pair-impair). */
export function pointInRings(p: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}
