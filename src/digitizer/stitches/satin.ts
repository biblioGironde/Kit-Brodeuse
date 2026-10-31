/**
 * Colonnes satin.
 *  - satinFromCenterline : zigzag autour d'un trait (équivalent « zigzag » d'Ink/Stitch)
 *  - satinFromRails      : colonne satin Ink/Stitch à deux rails
 */
import {
  add,
  cumulative,
  dedupe,
  dist,
  lerp,
  normalize,
  pointAt,
  polylineLength,
  scale,
  sub,
  type Pt,
} from "../geometry";
import type { SatinParams } from "../types";
import { resampleRunning } from "./running";

interface Frame {
  center: Pt;
  normal: Pt;
}

function framesAlong(pts: Pt[], step: number, closed: boolean): Frame[] {
  let line = dedupe(pts);
  if (closed && line.length > 2 && dist(line[0], line[line.length - 1]) > 1e-6)
    line = [...line, line[0]];
  const cum = cumulative(line);
  const total = cum[cum.length - 1];
  if (total < 1e-6) return [];
  const n = Math.max(2, Math.round(total / step) + 1);
  const eps = Math.min(0.5, total / 4);
  const frames: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1);
    const c = pointAt(line, cum, s);
    let a = pointAt(line, cum, Math.max(0, s - eps));
    let b = pointAt(line, cum, Math.min(total, s + eps));
    if (closed) {
      if (s - eps < 0) a = pointAt(line, cum, total + (s - eps));
      if (s + eps > total) b = pointAt(line, cum, s + eps - total);
    }
    const t = normalize(sub(b, a));
    frames.push({ center: c, normal: { x: -t.y, y: t.x } });
  }
  return frames;
}

function zigzag(frames: Frame[], halfWidth: number): Pt[] {
  return frames.map((f, i) =>
    add(f.center, scale(f.normal, i % 2 === 0 ? halfWidth : -halfWidth)),
  );
}

export function satinFromCenterline(
  pts: Pt[],
  p: SatinParams,
  closed: boolean,
): Pt[] {
  const width = Math.max(0.3, p.width + p.pullCompensation);
  const hw = width / 2;
  const underlay: Pt[] = [];

  if (p.centerWalk) {
    const walk = resampleRunning(pts, 1.5, closed);
    underlay.push(...walk, ...[...walk].reverse().slice(1));
  }
  if (p.contourUnderlay && width > 1.5) {
    const inset = Math.max(0.2, hw - 0.4);
    const fr = framesAlong(pts, 1.5, closed);
    const left = fr.map((f) => add(f.center, scale(f.normal, inset)));
    const right = fr.map((f) => add(f.center, scale(f.normal, -inset)));
    underlay.push(...left, ...right.reverse());
  }
  if (p.zigzagUnderlay && width > 1.5) {
    const fr = framesAlong(pts, 3, closed);
    const zz = zigzag(fr, Math.max(0.2, hw - 0.6));
    // aller-retour pour revenir au départ
    underlay.push(
      ...zz,
      ...zz
        .slice()
        .reverse()
        .filter((_, i) => i % 2 === 1),
    );
  }

  const frames = framesAlong(pts, Math.max(0.1, p.zigzagSpacing / 2), closed);
  const top = zigzag(frames, hw);
  return [...underlay, ...top];
}

/** Colonne satin à deux rails (format Ink/Stitch). */
export function satinFromRails(railA: Pt[], railB: Pt[], p: SatinParams): Pt[] {
  const a = dedupe(railA);
  let b = dedupe(railB);
  if (a.length < 2 || b.length < 2) return [];
  // Les deux rails doivent aller dans le même sens
  if (
    dist(a[0], b[0]) + dist(a[a.length - 1], b[b.length - 1]) >
    dist(a[0], b[b.length - 1]) + dist(a[a.length - 1], b[0])
  ) {
    b = b.slice().reverse();
  }
  const la = polylineLength(a);
  const lb = polylineLength(b);
  const ca = cumulative(a);
  const cb = cumulative(b);
  const step = Math.max(0.1, p.zigzagSpacing / 2);
  const n = Math.max(2, Math.round(Math.max(la, lb) / step) + 1);
  const pairs: Array<[Pt, Pt]> = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let pa = pointAt(a, ca, la * t);
    let pb = pointAt(b, cb, lb * t);
    if (p.pullCompensation) {
      const d = normalize(sub(pa, pb));
      pa = add(pa, scale(d, p.pullCompensation / 2));
      pb = add(pb, scale(d, -p.pullCompensation / 2));
    }
    pairs.push([pa, pb]);
  }
  const underlay: Pt[] = [];
  if (p.centerWalk) {
    const center = resampleRunning(
      pairs.map(([x, y]) => lerp(x, y, 0.5)),
      1.5,
    );
    underlay.push(...center, ...center.slice().reverse().slice(1));
  }
  if (p.contourUnderlay) {
    const sideA = resampleRunning(
      pairs.map(([x, y]) => lerp(x, y, 0.15)),
      1.5,
    );
    const sideB = resampleRunning(
      pairs.map(([x, y]) => lerp(x, y, 0.85)),
      1.5,
    );
    underlay.push(...sideA, ...sideB.reverse());
  }
  if (p.zigzagUnderlay) {
    const k = Math.max(1, Math.round(3 / step));
    const zz: Pt[] = [];
    for (let i = 0, s = 0; i < pairs.length; i += k, s++) {
      const [x, y] = pairs[i];
      zz.push(s % 2 === 0 ? lerp(x, y, 0.2) : lerp(x, y, 0.8));
    }
    underlay.push(
      ...zz,
      ...zz
        .slice()
        .reverse()
        .filter((_, i) => i % 2 === 1),
    );
  }
  const top = pairs.map(([x, y], i) => (i % 2 === 0 ? x : y));
  return [...underlay, ...top];
}
