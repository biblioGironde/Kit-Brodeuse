/**
 * Planification : objets → blocs de couleur → liste de points de broderie.
 */
import {
  boundsOf,
  dist,
  normalize,
  sub,
  add,
  scale,
  type Bounds,
  type Pt,
} from "./geometry";
import type {
  ColorBlock,
  DesignObject,
  PlannedStitch,
  StitchPlan,
} from "./types";
import { runningStitch } from "./stitches/running";
import { satinFromCenterline, satinFromRails } from "./stitches/satin";
import { tatamiFill } from "./stitches/fill";

/** Au-delà de cette distance, un saut est suivi d'une coupe de fil (mm). */
export const TRIM_JUMP_MM = 5;
/** Largeur satin au-delà de laquelle on avertit (points trop longs). */
export const MAX_SATIN_WIDTH = 8;
/** Points plus courts que ce seuil sont fusionnés (mm). */
const MIN_STITCH = 0.15;

export interface DesignTransform {
  scale: number;
  mirrorX?: boolean;
}

export function designBounds(objects: DesignObject[]): Bounds {
  const pts: Pt[] = [];
  for (const o of objects) {
    if (o.params.kind === "ignore") continue;
    const pad =
      o.source === "stroke" && o.params.kind === "satin"
        ? o.params.satin.width / 2
        : 0;
    for (const p of o.paths) {
      for (const q of p.points) {
        pts.push(
          { x: q.x - pad, y: q.y - pad },
          { x: q.x + pad, y: q.y + pad },
        );
      }
    }
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return boundsOf(pts);
}

/** Met à l'échelle les objets autour de l'origine (géométrie, pas les points : la densité est conservée). */
export function transformObjects(
  objects: DesignObject[],
  t: DesignTransform,
): DesignObject[] {
  const k = t.scale;
  const mx = t.mirrorX ? -1 : 1;
  return objects.map((o) => ({
    ...o,
    strokeWidth: o.strokeWidth * k,
    params:
      o.source === "stroke"
        ? {
            ...o.params,
            satin: { ...o.params.satin, width: o.params.satin.width * k },
          }
        : o.params,
    paths: o.paths.map((p) => ({
      closed: p.closed,
      points: p.points.map((q) => ({ x: q.x * k * mx, y: q.y * k })),
    })),
  }));
}

function tieIn(path: Pt[]): Pt[] {
  if (path.length < 2) return path;
  const d = scale(
    normalize(sub(path[1], path[0])),
    Math.min(0.5, dist(path[0], path[1])),
  );
  const p = path[0];
  return [p, add(p, d), p, add(p, d), p, ...path.slice(1)];
}

function tieOut(path: Pt[]): Pt[] {
  const n = path.length;
  if (n < 2) return path;
  const d = scale(
    normalize(sub(path[n - 2], path[n - 1])),
    Math.min(0.5, dist(path[n - 2], path[n - 1])),
  );
  const p = path[n - 1];
  return [...path, add(p, d), p, add(p, d), p];
}

/** Génère les points d'un objet (sans liaison avec l'objet précédent). */
export function stitchObject(
  o: DesignObject,
  cursor: Pt | null,
  warnings: string[],
): PlannedStitch[][] {
  const p = o.params;
  const runs: PlannedStitch[][] = [];
  const asRun = (pts: Pt[]): PlannedStitch[] =>
    pts.map((q) => ({ ...q, cmd: "stitch" as const }));
  const withTies = (pts: Pt[]) => (p.ties ? tieOut(tieIn(pts)) : pts);

  switch (p.kind) {
    case "ignore":
      return [];
    case "fill": {
      if (o.source !== "fill") {
        warnings.push(
          `« ${o.label} » : un trait ne peut pas être rempli, point droit utilisé.`,
        );
        o.paths.forEach((pl) =>
          runs.push(
            asRun(
              withTies(
                runningStitch(pl.points, { ...p.running, closed: pl.closed }),
              ),
            ),
          ),
        );
        break;
      }
      const rings = o.paths.map((r) => r.points);
      const f = p.fill;
      const all: PlannedStitch[] = [];
      if (f.underlay) {
        all.push(
          ...tatamiFill(
            rings,
            {
              angleDeg: f.underlayAngle ?? f.angle + 90,
              rowSpacing:
                f.underlayRowSpacing > 0
                  ? f.underlayRowSpacing
                  : f.rowSpacing * 3,
              maxStitchLength: f.maxStitchLength,
              staggers: f.staggers,
              expand: -2 * f.underlayInset,
              fillRule: o.fillRule,
            },
            cursor,
          ),
        );
      }
      const top = tatamiFill(
        rings,
        {
          angleDeg: f.angle,
          rowSpacing: f.rowSpacing,
          maxStitchLength: f.maxStitchLength,
          staggers: f.staggers,
          expand: f.expand,
          fillRule: o.fillRule,
        },
        all.length ? all[all.length - 1] : cursor,
      );
      if (all.length && top.length) {
        // liaison sous-couche → dessus : petit déplacement interne
        const a = all[all.length - 1];
        const d = dist(a, top[0]);
        top[0] = { ...top[0], cmd: d > TRIM_JUMP_MM ? "jump" : "stitch" };
        if (d > 0.6 && d <= TRIM_JUMP_MM) {
          const n = Math.ceil(d / 3);
          for (let i = 1; i < n; i++)
            all.push({
              x: a.x + ((top[0].x - a.x) * i) / n,
              y: a.y + ((top[0].y - a.y) * i) / n,
              cmd: "stitch",
            });
        }
      }
      all.push(...top);
      if (!all.length) {
        warnings.push(`« ${o.label} » est trop petit pour être rempli.`);
        break;
      }
      if (p.ties) {
        // points d'arrêt au début et à la fin, en suivant la première/dernière piqûre
        const firstStitches = all.slice(0, 2).filter((s) => s.cmd === "stitch");
        if (firstStitches.length === 2)
          all.splice(
            1,
            0,
            ...tieIn([all[0], all[1]])
              .slice(1, 5)
              .map((q) => ({ ...q, cmd: "stitch" as const })),
          );
        const n = all.length;
        if (n >= 2)
          all.push(
            ...tieOut([all[n - 2], all[n - 1]])
              .slice(2)
              .map((q) => ({ ...q, cmd: "stitch" as const })),
          );
      }
      runs.push(all);
      if (f.outline) {
        o.paths.forEach((pl) =>
          runs.push(
            asRun(
              withTies(
                runningStitch(pl.points, { ...p.running, closed: true }),
              ),
            ),
          ),
        );
      }
      break;
    }
    case "satin": {
      if (o.satinRails && o.paths.length >= 2) {
        const sorted = [...o.paths].sort(
          (a, b) => length(b.points) - length(a.points),
        );
        runs.push(
          asRun(
            withTies(
              satinFromRails(sorted[0].points, sorted[1].points, p.satin),
            ),
          ),
        );
        break;
      }
      if (p.satin.width > MAX_SATIN_WIDTH) {
        warnings.push(
          `« ${o.label} » : satin de ${p.satin.width.toFixed(1)} mm, les points seront longs et fragiles. Préférez un remplissage.`,
        );
      }
      o.paths.forEach((pl) =>
        runs.push(
          asRun(withTies(satinFromCenterline(pl.points, p.satin, pl.closed))),
        ),
      );
      break;
    }
    case "running":
      o.paths.forEach((pl) =>
        runs.push(
          asRun(
            withTies(
              runningStitch(pl.points, { ...p.running, closed: pl.closed }),
            ),
          ),
        ),
      );
      break;
  }
  return runs.filter((r) => r.length > 0);
}

const length = (pts: Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

/** Supprime les points trop courts (sauf changement de commande). */
function cleanRun(run: PlannedStitch[]): PlannedStitch[] {
  const out: PlannedStitch[] = [];
  for (const s of run) {
    const last = out[out.length - 1];
    if (
      last &&
      s.cmd === "stitch" &&
      last.cmd === "stitch" &&
      dist(last, s) < MIN_STITCH
    )
      continue;
    out.push(s);
  }
  return out;
}

export function planDesign(objects: DesignObject[]): StitchPlan {
  const warnings: string[] = [];
  const blocks: ColorBlock[] = [];
  let cursor: Pt | null = null;
  let current: ColorBlock | null = null;
  let jumpCount = 0;
  let trimCount = 0;
  let pendingTrim = false;

  for (const o of objects) {
    if (o.params.kind === "ignore") continue;
    const runs = stitchObject(o, cursor, warnings);
    if (!runs.length) continue;
    if (!current || current.color.toLowerCase() !== o.color.toLowerCase()) {
      current = { color: o.color, stitches: [] };
      blocks.push(current);
      pendingTrim = false;
    }
    for (const r of runs) {
      const run = cleanRun(r);
      const first = run[0];
      if (current.stitches.length) {
        const last = current.stitches[current.stitches.length - 1];
        const d = dist(last, first);
        if (pendingTrim || d > TRIM_JUMP_MM) {
          current.stitches.push({ ...last, cmd: "trim" });
          trimCount++;
        }
        if (d > 0.6 || pendingTrim) {
          current.stitches.push({ ...first, cmd: "jump" });
          jumpCount++;
        }
        pendingTrim = false;
      }
      for (const s of run) {
        if (s.cmd === "jump") jumpCount++;
        current.stitches.push(s);
      }
      cursor = run[run.length - 1];
    }
    if (o.params.trimAfter) pendingTrim = true;
  }

  const all = blocks.flatMap((b) => b.stitches);
  const stitchCount = all.filter((s) => s.cmd === "stitch").length;
  const bounds = all.length
    ? boundsOf(all)
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { blocks, stitchCount, jumpCount, trimCount, bounds, warnings };
}

/** Recentre le plan sur l'origine (le centre du cercle à broder). */
export function centerPlan(plan: StitchPlan): StitchPlan {
  const cx = (plan.bounds.minX + plan.bounds.maxX) / 2;
  const cy = (plan.bounds.minY + plan.bounds.maxY) / 2;
  const blocks = plan.blocks.map((b) => ({
    ...b,
    stitches: b.stitches.map((s) => ({ ...s, x: s.x - cx, y: s.y - cy })),
  }));
  return {
    ...plan,
    blocks,
    bounds: {
      minX: plan.bounds.minX - cx,
      maxX: plan.bounds.maxX - cx,
      minY: plan.bounds.minY - cy,
      maxY: plan.bounds.maxY - cy,
    },
  };
}

/** Codes de commande échangés avec le worker Python (pystitch). */
export const CMD_CODE = { stitch: 0, jump: 1, trim: 2, color: 3 } as const;

/**
 * Sérialise le plan en unités de 0,1 mm : [x, y, code].
 * Un changement de couleur est inséré entre chaque bloc.
 */
export function serializePlan(plan: StitchPlan): {
  stitches: number[][];
  colors: string[];
} {
  const stitches: number[][] = [];
  plan.blocks.forEach((b, i) => {
    if (i > 0) {
      const last = stitches[stitches.length - 1];
      stitches.push([last[0], last[1], CMD_CODE.trim]);
      stitches.push([last[0], last[1], CMD_CODE.color]);
    }
    b.stitches.forEach((s, j) => {
      const code = i > 0 && j === 0 ? CMD_CODE.jump : CMD_CODE[s.cmd];
      stitches.push([Math.round(s.x * 10), Math.round(s.y * 10), code]);
    });
  });
  return { stitches, colors: plan.blocks.map((b) => b.color) };
}

/** Durée estimée (PP1 : ~400 points/minute, + 1 min par changement de fil). */
export function estimateMinutes(plan: StitchPlan): number {
  return plan.stitchCount / 400 + Math.max(0, plan.blocks.length - 1);
}
