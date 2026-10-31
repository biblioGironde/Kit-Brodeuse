/**
 * Analyse de l'attribut « d » des chemins SVG et aplatissement en polylignes.
 *
 * Les commandes sont d'abord converties en segments absolus (droites et
 * courbes de Bézier cubiques ; les arcs et quadratiques sont convertis en
 * cubiques), puis la matrice de transformation est appliquée aux points de
 * contrôle, et enfin les courbes sont aplaties avec une tolérance en mm.
 */

import { apply, dist, type Matrix, type Pt } from "./geometry";

export type Segment =
  | { kind: "L"; to: Pt }
  | { kind: "C"; c1: Pt; c2: Pt; to: Pt };

export interface RawSubpath {
  start: Pt;
  segments: Segment[];
  closed: boolean;
}

export interface Polyline {
  points: Pt[];
  closed: boolean;
}

const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  let i = 0;
  let cmd = "";
  let argIndex = 0;
  while (i < d.length) {
    const ch = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      out.push(ch);
      cmd = ch.toUpperCase();
      argIndex = 0;
      i++;
    } else if (/[\s,]/.test(ch)) {
      i++;
    } else if (
      cmd === "A" &&
      (argIndex % 7 === 3 || argIndex % 7 === 4) &&
      (ch === "0" || ch === "1")
    ) {
      // Drapeaux d'arc : un seul caractère, éventuellement collé au suivant (« 0 01 »)
      out.push(ch === "1" ? 1 : 0);
      argIndex++;
      i++;
    } else {
      NUM_RE.lastIndex = i;
      const m = NUM_RE.exec(d);
      if (!m) {
        i++; // caractère inattendu : on l'ignore
        continue;
      }
      out.push(parseFloat(m[0]));
      argIndex++;
      i = NUM_RE.lastIndex;
    }
  }
  return out;
}

/** Lit les 7 arguments d'un arc. */
function arcArgs(
  tokens: Array<string | number>,
  idx: number,
): { args: number[]; next: number } | null {
  const args: number[] = [];
  let j = idx;
  while (
    args.length < 7 &&
    j < tokens.length &&
    typeof tokens[j] === "number"
  ) {
    args.push(tokens[j] as number);
    j++;
  }
  if (args.length < 7) return null;
  return { args, next: j };
}

function arcToCubics(
  p0: Pt,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p: Pt,
): Segment[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9 || dist(p0, p) < 1e-9)
    return [{ kind: "L", to: p }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p.x) / 2;
  const dy = (p0.y - p.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dtheta = ang(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry,
  );
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const delta = dtheta / n;
  const k = (4 / 3) * Math.tan(delta / 4);
  const segs: Segment[] = [];
  const point = (t: number) => {
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return { x: cos * x - sin * y + cx, y: sin * x + cos * y + cy };
  };
  const deriv = (t: number) => {
    const x = -rx * Math.sin(t);
    const y = ry * Math.cos(t);
    return { x: cos * x - sin * y, y: sin * x + cos * y };
  };
  let t = theta1;
  for (let i = 0; i < n; i++) {
    const t2 = t + delta;
    const a = point(t);
    const b = i === n - 1 ? p : point(t2);
    const da = deriv(t);
    const db = deriv(t2);
    segs.push({
      kind: "C",
      c1: { x: a.x + k * da.x, y: a.y + k * da.y },
      c2: { x: b.x - k * db.x, y: b.y - k * db.y },
      to: b,
    });
    t = t2;
  }
  return segs;
}

export function parsePathData(d: string): RawSubpath[] {
  const tokens = tokenize(d);
  const subpaths: RawSubpath[] = [];
  let cur: RawSubpath | null = null;
  let pos: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null;
  let lastQuad: Pt | null = null;
  let cmd = "";
  let i = 0;

  const ensure = () => {
    if (!cur) {
      cur = { start: { ...pos }, segments: [], closed: false };
      subpaths.push(cur);
    }
    return cur;
  };
  const num = () => {
    const v = tokens[i];
    if (typeof v !== "number") throw new Error("Chemin SVG invalide");
    i++;
    return v;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        if (cur) {
          if (dist(pos, start) > 1e-9)
            cur.segments.push({ kind: "L", to: { ...start } });
          cur.closed = true;
        }
        pos = { ...start };
        cur = null;
        lastCtrl = lastQuad = null;
        continue;
      }
    } else if (!cmd) {
      i++;
      continue;
    }
    if (i >= tokens.length || typeof tokens[i] !== "number") continue;

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? pos.x : 0;
    const oy = rel ? pos.y : 0;
    let ctrlSet: Pt | null = null;
    let quadSet: Pt | null = null;

    switch (C) {
      case "M": {
        const p = { x: num() + ox, y: num() + oy };
        pos = p;
        start = { ...p };
        cur = { start: { ...p }, segments: [], closed: false };
        subpaths.push(cur);
        cmd = rel ? "l" : "L"; // les paires suivantes sont des lignes
        break;
      }
      case "L": {
        const p = { x: num() + ox, y: num() + oy };
        ensure().segments.push({ kind: "L", to: p });
        pos = p;
        break;
      }
      case "H": {
        const p = { x: num() + ox, y: pos.y };
        ensure().segments.push({ kind: "L", to: p });
        pos = p;
        break;
      }
      case "V": {
        const p = { x: pos.x, y: num() + oy };
        ensure().segments.push({ kind: "L", to: p });
        pos = p;
        break;
      }
      case "C": {
        const c1 = { x: num() + ox, y: num() + oy };
        const c2 = { x: num() + ox, y: num() + oy };
        const p = { x: num() + ox, y: num() + oy };
        ensure().segments.push({ kind: "C", c1, c2, to: p });
        ctrlSet = c2;
        pos = p;
        break;
      }
      case "S": {
        const c1: Pt = lastCtrl
          ? { x: 2 * pos.x - lastCtrl.x, y: 2 * pos.y - lastCtrl.y }
          : { ...pos };
        const c2 = { x: num() + ox, y: num() + oy };
        const p = { x: num() + ox, y: num() + oy };
        ensure().segments.push({ kind: "C", c1, c2, to: p });
        ctrlSet = c2;
        pos = p;
        break;
      }
      case "Q": {
        const q = { x: num() + ox, y: num() + oy };
        const p = { x: num() + ox, y: num() + oy };
        ensure().segments.push(quadToCubic(pos, q, p));
        quadSet = q;
        pos = p;
        break;
      }
      case "T": {
        const q: Pt = lastQuad
          ? { x: 2 * pos.x - lastQuad.x, y: 2 * pos.y - lastQuad.y }
          : { ...pos };
        const p = { x: num() + ox, y: num() + oy };
        ensure().segments.push(quadToCubic(pos, q, p));
        quadSet = q;
        pos = p;
        break;
      }
      case "A": {
        const r = arcArgs(tokens, i);
        if (!r) {
          i = tokens.length;
          break;
        }
        i = r.next;
        const [rx, ry, rot, la, sw, x, y] = r.args;
        const p = { x: x + ox, y: y + oy };
        ensure().segments.push(
          ...arcToCubics(pos, rx, ry, rot, la !== 0, sw !== 0, p),
        );
        pos = p;
        break;
      }
      default:
        i++;
    }
    lastCtrl = ctrlSet;
    lastQuad = quadSet;
  }
  return subpaths.filter((s) => s.segments.length > 0);
}

function quadToCubic(p0: Pt, q: Pt, p: Pt): Segment {
  return {
    kind: "C",
    c1: { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
    c2: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) },
    to: p,
  };
}

/** Applique la matrice puis aplatit les courbes (tolérance en unités de sortie). */
export function flattenSubpaths(
  subpaths: RawSubpath[],
  m: Matrix,
  tolerance = 0.05,
): Polyline[] {
  const result: Polyline[] = [];
  for (const sp of subpaths) {
    let p0 = apply(m, sp.start);
    const pts: Pt[] = [p0];
    for (const seg of sp.segments) {
      if (seg.kind === "L") {
        p0 = apply(m, seg.to);
        pts.push(p0);
      } else {
        const c1 = apply(m, seg.c1);
        const c2 = apply(m, seg.c2);
        const p3 = apply(m, seg.to);
        flattenCubic(p0, c1, c2, p3, tolerance, pts, 0);
        pts.push(p3);
        p0 = p3;
      }
    }
    result.push({ points: pts, closed: sp.closed });
  }
  return result;
}

function flattenCubic(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  tol: number,
  out: Pt[],
  depth: number,
) {
  // Critère de planéité : distance des points de contrôle à la corde
  const ux = 3 * p1.x - 2 * p0.x - p3.x;
  const uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - p0.x - 2 * p3.x;
  const vy = 3 * p2.y - p0.y - 2 * p3.y;
  const flat = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);
  if (depth > 12 || flat <= 16 * tol * tol) return;
  const m01 = mid(p0, p1);
  const m12 = mid(p1, p2);
  const m23 = mid(p2, p3);
  const a = mid(m01, m12);
  const b = mid(m12, m23);
  const c = mid(a, b);
  flattenCubic(p0, m01, a, c, tol, out, depth + 1);
  out.push(c);
  flattenCubic(c, b, m23, p3, tol, out, depth + 1);
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
