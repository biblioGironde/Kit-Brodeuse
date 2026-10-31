/**
 * Export SVG avec les paramètres Ink/Stitch (attributs inkstitch:*).
 * Le fichier se rouvre dans le Kit Brodeuse, et dans Inkscape + Ink/Stitch.
 */
import { boundsOf } from "./geometry";
import { INKSTITCH_NS } from "./svgDocument";
import type { DesignObject } from "./types";

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function exportInkstitchSvg(objects: DesignObject[]): string {
  const all = objects.flatMap((o) => o.paths.flatMap((p) => p.points));
  const b = all.length
    ? boundsOf(all)
    : { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const pad = 2;
  const w = b.maxX - b.minX + 2 * pad;
  const h = b.maxY - b.minY + 2 * pad;
  const ox = -b.minX + pad;
  const oy = -b.minY + pad;

  const body = objects
    .map((o) => {
      const d = o.paths
        .map(
          (p) =>
            p.points
              .map((q, i) => `${i ? "L" : "M"}${f(q.x + ox)},${f(q.y + oy)}`)
              .join(" ") + (p.closed ? " Z" : ""),
        )
        .join(" ");
      const p = o.params;
      const a: Record<string, string> = {};
      if (o.source === "fill") {
        a.style = `fill:${o.color};stroke:none;fill-rule:${o.fillRule}`;
        if (p.kind === "ignore") a["inkstitch:fill"] = "False";
        a["inkstitch:angle"] = f(p.fill.angle);
        a["inkstitch:row_spacing_mm"] = f(p.fill.rowSpacing);
        a["inkstitch:max_stitch_length_mm"] = f(p.fill.maxStitchLength);
        a["inkstitch:staggers"] = f(p.fill.staggers);
        a["inkstitch:expand_mm"] = f(p.fill.expand);
        a["inkstitch:fill_underlay"] = p.fill.underlay ? "True" : "False";
        if (p.fill.underlayAngle != null)
          a["inkstitch:fill_underlay_angle"] = f(p.fill.underlayAngle);
        if (p.fill.underlayRowSpacing > 0)
          a["inkstitch:fill_underlay_row_spacing_mm"] = f(
            p.fill.underlayRowSpacing,
          );
        a["inkstitch:fill_underlay_inset_mm"] = f(p.fill.underlayInset);
      } else {
        a.style = `fill:none;stroke:${o.color};stroke-width:${f(o.params.kind === "satin" ? p.satin.width : o.strokeWidth || 0.3)}`;
        if (p.kind === "satin") {
          if (o.satinRails) a["inkstitch:satin_column"] = "True";
          else a["inkstitch:stroke_method"] = "zigzag_stitch";
          a["inkstitch:zigzag_spacing_mm"] = f(p.satin.zigzagSpacing);
          a["inkstitch:pull_compensation_mm"] = f(p.satin.pullCompensation);
          a["inkstitch:center_walk_underlay"] = p.satin.centerWalk
            ? "True"
            : "False";
          a["inkstitch:contour_underlay"] = p.satin.contourUnderlay
            ? "True"
            : "False";
          a["inkstitch:zigzag_underlay"] = p.satin.zigzagUnderlay
            ? "True"
            : "False";
        } else {
          a["inkstitch:stroke_method"] = "running_stitch";
          a["inkstitch:running_stitch_length_mm"] = f(p.running.length);
          a["inkstitch:repeats"] = String(p.running.repeats);
          a["inkstitch:bean_stitch_repeats"] = String(p.running.bean);
        }
      }
      if (p.trimAfter) a["inkstitch:trim_after"] = "True";
      if (!p.ties) a["inkstitch:ties"] = "3";
      const attrs = Object.entries(a)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(" ");
      return `  <path id="${esc(o.id)}" inkscape:label="${esc(o.label)}" d="${d}" ${attrs}/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:inkstitch="${INKSTITCH_NS}"
  width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">
  <!-- Préparé avec le Kit Brodeuse (biblio.gironde) — paramètres compatibles Ink/Stitch -->
${body}
</svg>
`;
}
