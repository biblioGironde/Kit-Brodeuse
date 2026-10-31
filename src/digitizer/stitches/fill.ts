/**
 * Remplissage tatami (équivalent du « auto_fill » d'Ink/Stitch).
 *
 * 1. La forme est tournée pour que les rangs soient horizontaux.
 * 2. Chaque rang est intersecté avec les contours (règle nonzero / evenodd).
 * 3. Les intervalles sont regroupés en « sections » monotones, brodées en
 *    aller-retour (boustrophédon) avec des points décalés (effet tatami).
 * 4. Les sections sont enchaînées au plus proche ; le déplacement se fait
 *    à l'intérieur de la forme (ligne droite ou le long du contour) pour
 *    éviter les sauts de fil, sinon par un saut.
 */
import {
  boundsOf,
  dist,
  rotate,
  segmentsIntersect,
  pointInRings,
  type Pt,
} from "../geometry";
import type { PlannedStitch } from "../types";
import { resampleRunning } from "./running";

export interface FillOptions {
  angleDeg: number;
  rowSpacing: number;
  maxStitchLength: number;
  staggers: number;
  /** >0 : allonge les rangs ; <0 : retrait (sous-couche) */
  expand: number;
  fillRule: "nonzero" | "evenodd";
}

interface Interval {
  row: number;
  x0: number;
  x1: number;
}

type Section = Interval[];

const MIN_ROW = 0.3;

function rowIntervals(
  rings: Pt[][],
  y: number,
  rule: "nonzero" | "evenodd",
): Array<[number, number]> {
  const xs: Array<{ x: number; w: number }> = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j];
      const b = ring[i];
      if (a.y <= y !== b.y <= y) {
        const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
        xs.push({ x, w: b.y > a.y ? 1 : -1 });
      }
    }
  }
  xs.sort((p, q) => p.x - q.x);
  const out: Array<[number, number]> = [];
  if (rule === "evenodd") {
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i].x, xs[i + 1].x]);
  } else {
    let wind = 0;
    let start = 0;
    for (const c of xs) {
      const before = wind;
      wind += c.w;
      if (before === 0 && wind !== 0) start = c.x;
      else if (before !== 0 && wind === 0) out.push([start, c.x]);
    }
  }
  return out;
}

function buildSections(rings: Pt[][], o: FillOptions): Section[] {
  const b = boundsOf(rings.flat());
  const sp = Math.max(0.05, o.rowSpacing);
  const k0 = Math.ceil(b.minY / sp + 1e-9);
  const k1 = Math.floor(b.maxY / sp - 1e-9);
  const sections: Section[] = [];
  let open: Section[] = [];
  for (let k = k0; k <= k1; k++) {
    const y = k * sp;
    const ivs = rowIntervals(rings, y, o.fillRule)
      .map(
        ([x0, x1]) =>
          [x0 - o.expand / 2, x1 + o.expand / 2] as [number, number],
      )
      .filter(([x0, x1]) => x1 - x0 >= MIN_ROW);
    const continued = new Set<Section>();
    const nextOpen: Section[] = [];
    for (const [x0, x1] of ivs) {
      const target = open.find((s) => {
        const last = s[s.length - 1];
        return (
          !continued.has(s) &&
          last.row === k - 1 &&
          x0 < last.x1 &&
          x1 > last.x0
        );
      });
      const iv = { row: k, x0, x1 };
      if (target) {
        target.push(iv);
        continued.add(target);
        nextOpen.push(target);
      } else {
        const s: Section = [iv];
        sections.push(s);
        nextOpen.push(s);
      }
    }
    open = nextOpen;
  }
  return sections;
}

/** Points d'un rang, alignés sur une grille décalée selon le rang (effet tatami). */
function rowPoints(iv: Interval, o: FillOptions, leftToRight: boolean): Pt[] {
  const L = Math.max(0.5, o.maxStitchLength);
  const y = iv.row * o.rowSpacing;
  const st = Math.max(1, Math.round(o.staggers));
  const offset = ((((iv.row % st) + st) % st) / st) * L;
  const xs: number[] = [iv.x0];
  const minGap = Math.min(0.5, L / 4);
  let n = Math.ceil((iv.x0 - offset) / L);
  for (let x = n * L + offset; x < iv.x1 - minGap; n++, x = n * L + offset) {
    if (x > iv.x0 + minGap) xs.push(x);
  }
  xs.push(iv.x1);
  if (!leftToRight) xs.reverse();
  return xs.map((x) => ({ x, y }));
}

function stitchSection(
  sec: Section,
  o: FillOptions,
  fromTop: boolean,
  startLeft: boolean,
): Pt[] {
  const rows = fromTop ? sec : [...sec].reverse();
  const out: Pt[] = [];
  rows.forEach((iv, i) => {
    const ltr = i % 2 === 0 ? startLeft : !startLeft;
    const pts = rowPoints(iv, o, ltr);
    if (out.length) {
      // liaison avec le rang précédent, découpée si trop longue
      const prev = out[out.length - 1];
      const d = dist(prev, pts[0]);
      const pieces = Math.ceil(d / o.maxStitchLength);
      for (let p = 1; p < pieces; p++) {
        out.push({
          x: prev.x + ((pts[0].x - prev.x) * p) / pieces,
          y: prev.y + ((pts[0].y - prev.y) * p) / pieces,
        });
      }
    }
    out.push(...pts);
  });
  return out;
}

function sectionCorners(sec: Section, o: FillOptions) {
  const top = sec[0];
  const bot = sec[sec.length - 1];
  const yT = top.row * o.rowSpacing;
  const yB = bot.row * o.rowSpacing;
  return [
    { fromTop: true, startLeft: true, p: { x: top.x0, y: yT } },
    { fromTop: true, startLeft: false, p: { x: top.x1, y: yT } },
    { fromTop: false, startLeft: true, p: { x: bot.x0, y: yB } },
    { fromTop: false, startLeft: false, p: { x: bot.x1, y: yB } },
  ];
}

/** Déplacement interne entre deux points (ou null si un saut est nécessaire). */
function travel(
  a: Pt,
  b: Pt,
  rings: Pt[][],
  rule: "nonzero" | "evenodd",
): Pt[] | null {
  const d = dist(a, b);
  if (d < 0.6) return [b];
  const crosses = (p: Pt, q: Pt) => {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (segmentsIntersect(p, q, ring[j], ring[i])) return true;
      }
    }
    return false;
  };
  // (règle pair-impair suffisante pour tester le milieu du déplacement)
  void rule;
  const insideMid = (p: Pt, q: Pt) =>
    pointInRings({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, rings);
  if (!crosses(a, b) && insideMid(a, b))
    return resampleRunning([a, b], 2.5).slice(1);

  // Le long du contour le plus proche
  let best: {
    r: number;
    ia: number;
    ib: number;
    da: number;
    db: number;
  } | null = null;
  rings.forEach((ring, r) => {
    let ia = 0;
    let ib = 0;
    let da = Infinity;
    let db = Infinity;
    ring.forEach((p, i) => {
      const x = dist(p, a);
      const y = dist(p, b);
      if (x < da) {
        da = x;
        ia = i;
      }
      if (y < db) {
        db = y;
        ib = i;
      }
    });
    if (!best || da + db < best.da + best.db) best = { r, ia, ib, da, db };
  });
  if (!best) return null;
  const { r, ia, ib, da, db } = best as {
    r: number;
    ia: number;
    ib: number;
    da: number;
    db: number;
  };
  if (da > 1.5 || db > 1.5) return null;
  const ring = rings[r];
  const n = ring.length;
  const fwd: Pt[] = [];
  for (let i = ia; ; i = (i + 1) % n) {
    fwd.push(ring[i]);
    if (i === ib || fwd.length > n) break;
  }
  const bwd: Pt[] = [];
  for (let i = ia; ; i = (i - 1 + n) % n) {
    bwd.push(ring[i]);
    if (i === ib || bwd.length > n) break;
  }
  const lenOf = (pts: Pt[]) =>
    pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const path = lenOf(fwd) <= lenOf(bwd) ? fwd : bwd;
  if (lenOf(path) > 4 * d + 10) return null;
  return resampleRunning([a, ...path, b], 2.5).slice(1);
}

/**
 * Génère le remplissage. `start` : position actuelle de l'aiguille (mm, repère du dessin).
 */
export function tatamiFill(
  ringsIn: Pt[][],
  o: FillOptions,
  start: Pt | null,
): PlannedStitch[] {
  const ang = (o.angleDeg * Math.PI) / 180;
  const rings = ringsIn
    .filter((r) => r.length >= 3)
    .map((r) => r.map((p) => rotate(p, ang)));
  if (!rings.length) return [];
  const sections = buildSections(rings, o);
  if (!sections.length) return [];
  const out: PlannedStitch[] = [];
  let cur: Pt | null = start ? rotate(start, ang) : null;
  const remaining = new Set(sections);
  while (remaining.size) {
    let pick: {
      sec: Section;
      fromTop: boolean;
      startLeft: boolean;
      p: Pt;
    } | null = null;
    let bestD = Infinity;
    for (const sec of remaining) {
      for (const c of sectionCorners(sec, o)) {
        const d = cur ? dist(cur, c.p) : c.p.y * 1000 + c.p.x;
        if (d < bestD) {
          bestD = d;
          pick = { sec, ...c };
        }
      }
    }
    if (!pick) break;
    remaining.delete(pick.sec);
    const pts = stitchSection(pick.sec, o, pick.fromTop, pick.startLeft);
    if (cur && out.length) {
      const path = travel(cur, pts[0], rings, o.fillRule);
      if (path) path.forEach((p) => out.push({ ...p, cmd: "stitch" }));
      else out.push({ ...pts[0], cmd: "jump" });
    } else {
      // premier point de l'objet : la liaison depuis l'objet précédent est gérée par l'appelant
      out.push({ ...pts[0], cmd: "stitch" });
    }
    for (let i = 1; i < pts.length; i++) out.push({ ...pts[i], cmd: "stitch" });
    cur = pts[pts.length - 1];
  }
  return out.map((s) => ({ ...rotate(s, -ang), cmd: s.cmd }));
}
