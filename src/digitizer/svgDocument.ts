/**
 * Lecture d'un document SVG et extraction des objets à broder.
 *
 * - Gère les éléments path, rect, circle, ellipse, line, polyline, polygon et use.
 * - Applique les transformations, les styles hérités (attributs, style="",
 *   règles de classe simples dans <style>).
 * - Convertit les unités du document en millimètres.
 * - Lit les paramètres Ink/Stitch (attributs inkstitch:*) quand ils existent,
 *   pour rester compatible avec les fichiers préparés dans Inkscape.
 */

import { IDENTITY, meanScale, multiply, type Matrix } from "./geometry";
import { flattenSubpaths, parsePathData, type RawSubpath } from "./svgPath";
import {
  cloneParams,
  DEFAULT_PARAMS,
  type DesignObject,
  type ObjectParams,
  type ParsedDesign,
} from "./types";
import { parseColor } from "./colors";

export const INKSTITCH_NS = "http://inkstitch.org/namespace";
const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  "": 25.4 / 96,
};

/** Trait plus large que ce seuil → colonne satin automatique (SVG non Ink/Stitch) */
export const AUTO_SATIN_MIN_WIDTH = 1.2;

function parseLength(v: string | null): { value: number; unit: string } | null {
  if (!v) return null;
  const m =
    /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: m[2].toLowerCase() };
}

export function parseTransform(t: string | null): Matrix {
  let m: Matrix = IDENTITY;
  if (!t) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(t))) {
    const a = r[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(parseFloat);
    let k: Matrix = IDENTITY;
    switch (r[1]) {
      case "matrix":
        if (a.length === 6) k = a as Matrix;
        break;
      case "translate":
        k = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
        break;
      case "scale":
        k = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
        break;
      case "rotate": {
        const ang = ((a[0] || 0) * Math.PI) / 180;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const rot: Matrix = [c, s, -s, c, 0, 0];
        if (a.length >= 3) {
          k = multiply(multiply([1, 0, 0, 1, a[1], a[2]], rot), [
            1,
            0,
            0,
            1,
            -a[1],
            -a[2],
          ]);
        } else k = rot;
        break;
      }
      case "skewX":
        k = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        k = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, k);
  }
  return m;
}

type Style = Record<string, string>;

const INHERITED = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "fill-rule",
  "display",
  "visibility",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
]);
const STYLE_PROPS = [...INHERITED, "stroke-dasharray"];

function parseStyleAttr(s: string | null): Style {
  const out: Style = {};
  if (!s) return out;
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** Règles CSS très simples : .classe, #id, élément (sélecteurs séparés par des virgules). */
function parseStyleSheets(doc: Document): Array<{ sel: string; style: Style }> {
  const rules: Array<{ sel: string; style: Style }> = [];
  doc.querySelectorAll("style").forEach((el) => {
    const css = (el.textContent || "").replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /([^{}]+)\{([^}]*)\}/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(css))) {
      const style = parseStyleAttr(r[2]);
      for (const sel of r[1].split(",")) rules.push({ sel: sel.trim(), style });
    }
  });
  return rules;
}

function matchesSimple(el: Element, sel: string): boolean {
  if (sel.startsWith("."))
    return (el.getAttribute("class") || "").split(/\s+/).includes(sel.slice(1));
  if (sel.startsWith("#")) return el.getAttribute("id") === sel.slice(1);
  return el.localName === sel;
}

interface Ctx {
  matrix: Matrix;
  style: Style;
  mmPerUnit: number;
}

export function parseSvg(text: string, fileLabel = "motif"): ParsedDesign {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (
    !root ||
    root.localName !== "svg" ||
    doc.getElementsByTagName("parsererror").length
  ) {
    throw new Error("Ce fichier n'est pas un SVG valide.");
  }
  const warnings: string[] = [];
  const rules = parseStyleSheets(doc);

  // --- Unités du document → mm
  const vb = (root.getAttribute("viewBox") || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseFloat);
  const w = parseLength(root.getAttribute("width"));
  const h = parseLength(root.getAttribute("height"));
  let sx = 25.4 / 96;
  let sy = 25.4 / 96;
  let tx = 0;
  let ty = 0;
  let widthMm = 0;
  let heightMm = 0;
  const toMm = (
    l: { value: number; unit: string } | null,
    fallbackUnits: number,
  ) =>
    l && l.unit !== "%"
      ? l.value * (UNIT_TO_MM[l.unit] ?? 25.4 / 96)
      : fallbackUnits * (25.4 / 96);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    widthMm = toMm(w, vb[2]);
    heightMm = toMm(h, vb[3]);
    if (!w && h) widthMm = (heightMm * vb[2]) / vb[3];
    if (!h && w) heightMm = (widthMm * vb[3]) / vb[2];
    sx = widthMm / vb[2];
    sy = heightMm / vb[3];
    // preserveAspectRatio par défaut (xMidYMid meet) : on garde l'échelle la plus petite
    const s = Math.min(sx, sy);
    tx = -vb[0] * s + (widthMm - vb[2] * s) / 2;
    ty = -vb[1] * s + (heightMm - vb[3] * s) / 2;
    sx = sy = s;
  } else {
    widthMm = toMm(w, 0);
    heightMm = toMm(h, 0);
    if (w && w.unit && w.unit !== "px") sx = sy = UNIT_TO_MM[w.unit] ?? sx;
  }
  const rootMatrix: Matrix = [sx, 0, 0, sy, tx, ty];

  const objects: DesignObject[] = [];
  let counter = 0;
  let hasInkstitch = false;
  let textWarned = false;
  let imageWarned = false;

  const computeStyle = (el: Element, parent: Style): Style => {
    const s: Style = {};
    for (const k of Object.keys(parent)) if (INHERITED.has(k)) s[k] = parent[k];
    for (const p of STYLE_PROPS) {
      const v = el.getAttribute(p);
      if (v != null) s[p] = v.trim();
    }
    for (const r of rules)
      if (matchesSimple(el, r.sel)) Object.assign(s, r.style);
    Object.assign(s, parseStyleAttr(el.getAttribute("style")));
    for (const k of Object.keys(s))
      if (s[k] === "inherit" && parent[k]) s[k] = parent[k];
    return s;
  };

  const resolveFill = (value: string | undefined): string | null => {
    if (!value) return null;
    const ref = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value);
    if (ref) {
      // Dégradé : on prend la couleur du premier arrêt
      const grad = doc.getElementById(ref[1]);
      const visit = (g: Element | null, depth = 0): string | null => {
        if (!g || depth > 4) return null;
        const stop = g.querySelector("stop");
        if (stop) {
          const st = parseStyleAttr(stop.getAttribute("style"));
          return parseColor(
            st["stop-color"] || stop.getAttribute("stop-color") || "#000",
          );
        }
        const href =
          g.getAttribute("href") ||
          g.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        return href
          ? visit(doc.getElementById(href.replace(/^#/, "")), depth + 1)
          : null;
      };
      return visit(grad);
    }
    return parseColor(value);
  };

  const inkParams = (
    el: Element,
    source: "fill" | "stroke",
    strokeWidthMm: number,
  ): { params: ObjectParams; satinRails: boolean } => {
    const p = cloneParams(DEFAULT_PARAMS);
    const get = (name: string): string | null => {
      const v =
        el.getAttributeNS(INKSTITCH_NS, name) ??
        el.getAttribute("inkstitch:" + name);
      if (v != null && v !== "") hasInkstitch = true;
      return v != null && v !== "" ? v : null;
    };
    const num = (name: string): number | null => {
      const v = get(name);
      if (v == null) return null;
      const n = parseFloat(v.split(/\s+/)[0]);
      return Number.isFinite(n) ? n : null;
    };
    const bool = (name: string): boolean | null => {
      const v = get(name);
      if (v == null) return null;
      return /^(true|1|yes)$/i.test(v);
    };

    const satinColumn = bool("satin_column") === true;
    const strokeMethod = get("stroke_method");
    let satinRails = false;

    if (source === "fill") {
      p.kind =
        bool("auto_fill") === false || bool("fill") === false
          ? "ignore"
          : "fill";
      p.fill.angle = num("angle") ?? p.fill.angle;
      p.fill.rowSpacing = num("row_spacing_mm") ?? p.fill.rowSpacing;
      p.fill.maxStitchLength =
        num("max_stitch_length_mm") ?? p.fill.maxStitchLength;
      p.fill.staggers = num("staggers") ?? p.fill.staggers;
      p.fill.expand = num("expand_mm") ?? p.fill.expand;
      p.fill.underlay = bool("fill_underlay") ?? p.fill.underlay;
      p.fill.underlayAngle = num("fill_underlay_angle");
      p.fill.underlayRowSpacing = num("fill_underlay_row_spacing_mm") ?? 0;
      p.fill.underlayInset =
        num("fill_underlay_inset_mm") ?? p.fill.underlayInset;
      const method = get("fill_method");
      if (method && !/^(auto_fill|legacy_fill|tatami_fill)$/.test(method)) {
        warnings.push(
          `« ${el.getAttribute("id") || "objet"} » : le remplissage Ink/Stitch « ${method} » est remplacé par un remplissage tatami.`,
        );
      }
    } else {
      if (satinColumn) {
        p.kind = "satin";
        satinRails = true;
      } else if (strokeMethod === "zigzag_stitch") {
        p.kind = "satin";
      } else if (strokeMethod || hasAnyInk(el)) {
        p.kind = "running";
      } else {
        p.kind = strokeWidthMm >= AUTO_SATIN_MIN_WIDTH ? "satin" : "running";
      }
      p.satin.width = Math.max(0.5, strokeWidthMm);
      p.satin.zigzagSpacing = num("zigzag_spacing_mm") ?? p.satin.zigzagSpacing;
      p.satin.pullCompensation =
        num("pull_compensation_mm") ?? p.satin.pullCompensation;
      const cw = bool("center_walk_underlay");
      const co = bool("contour_underlay");
      const zz = bool("zigzag_underlay");
      if (cw != null || co != null || zz != null) {
        p.satin.centerWalk = !!cw;
        p.satin.contourUnderlay = !!co;
        p.satin.zigzagUnderlay = !!zz;
      }
      p.running.length = num("running_stitch_length_mm") ?? p.running.length;
      p.running.repeats = Math.max(
        1,
        Math.round(num("repeats") ?? p.running.repeats),
      );
      p.running.bean = Math.max(0, Math.round(num("bean_stitch_repeats") ?? 0));
    }
    p.ties = get("ties") !== "3" && get("lock_start") !== "none";
    p.trimAfter = bool("trim_after") ?? false;
    return { params: p, satinRails };
  };

  const hasAnyInk = (el: Element) => {
    for (const a of Array.from(el.attributes)) {
      if (a.namespaceURI === INKSTITCH_NS || a.name.startsWith("inkstitch:"))
        return true;
    }
    return false;
  };

  const FR_NAMES: Record<string, string> = {
    path: "Tracé",
    rect: "Rectangle",
    circle: "Cercle",
    ellipse: "Ellipse",
    line: "Ligne",
    polyline: "Ligne brisée",
    polygon: "Polygone",
  };
  const labelOf = (el: Element) => {
    const ink =
      el.getAttributeNS(INKSCAPE_NS, "label") ||
      el.getAttribute("inkscape:label");
    if (ink) return ink;
    const id = el.getAttribute("id");
    // Les identifiants générés automatiquement (path123, rect4…) ne sont pas parlants
    if (
      id &&
      !/^(path|rect|circle|ellipse|line|polyline|polygon|g|use|obj)-?\d*$/i.test(
        id,
      )
    ) {
      return id;
    }
    return `${FR_NAMES[el.localName] ?? el.localName} ${counter + 1}`;
  };

  const shapeToSubpaths = (el: Element): RawSubpath[] | null => {
    const n = (a: string) => parseFloat(el.getAttribute(a) || "0") || 0;
    switch (el.localName) {
      case "path":
        return parsePathData(el.getAttribute("d") || "");
      case "rect": {
        const x = n("x");
        const y = n("y");
        const w = n("width");
        const h = n("height");
        if (w <= 0 || h <= 0) return null;
        let rx = el.hasAttribute("rx") ? n("rx") : n("ry");
        let ry = el.hasAttribute("ry") ? n("ry") : rx;
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) {
          return parsePathData(
            `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`,
          );
        }
        return parsePathData(`M${x},${y} H${x + w} V${y + h} H${x} Z`);
      }
      case "circle":
      case "ellipse": {
        const cx = n("cx");
        const cy = n("cy");
        const rx = el.localName === "circle" ? n("r") : n("rx");
        const ry = el.localName === "circle" ? n("r") : n("ry");
        if (rx <= 0 || ry <= 0) return null;
        return parsePathData(
          `M${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx},${cy + ry} A${rx},${ry} 0 0 1 ${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx},${cy - ry} A${rx},${ry} 0 0 1 ${cx + rx},${cy} Z`,
        );
      }
      case "line":
        return parsePathData(`M${n("x1")},${n("y1")} L${n("x2")},${n("y2")}`);
      case "polyline":
      case "polygon": {
        const nums = (el.getAttribute("points") || "")
          .trim()
          .split(/[\s,]+/)
          .map(parseFloat);
        if (nums.length < 4) return null;
        let d = `M${nums[0]},${nums[1]}`;
        for (let i = 2; i + 1 < nums.length; i += 2)
          d += ` L${nums[i]},${nums[i + 1]}`;
        if (el.localName === "polygon") d += " Z";
        return parsePathData(d);
      }
    }
    return null;
  };

  const walk = (el: Element, ctx: Ctx, depth: number) => {
    if (depth > 40) return;
    const name = el.localName;
    if (
      [
        "defs",
        "clipPath",
        "mask",
        "symbol",
        "marker",
        "pattern",
        "metadata",
        "title",
        "desc",
        "style",
        "linearGradient",
        "radialGradient",
        "namedview",
        "script",
      ].includes(name)
    ) {
      return;
    }
    if (name === "text" || name === "flowRoot") {
      if (!textWarned) {
        warnings.push(
          "Le SVG contient du texte : convertissez-le en chemins avant l'import (Inkscape : Chemin › Objet en chemin).",
        );
        textWarned = true;
      }
      return;
    }
    if (name === "image") {
      if (!imageWarned) {
        warnings.push(
          "Les images bitmap sont ignorées : vectorisez-les d'abord (Inkscape : Chemin › Vectoriser un objet matriciel).",
        );
        imageWarned = true;
      }
      return;
    }
    const style = computeStyle(el, ctx.style);
    if (style.display === "none" || style.visibility === "hidden") return;
    // Calques Inkscape masqués
    let matrix = multiply(
      ctx.matrix,
      parseTransform(el.getAttribute("transform")),
    );

    if (name === "use") {
      const href =
        el.getAttribute("href") ||
        el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      const target = href ? doc.getElementById(href.replace(/^#/, "")) : null;
      if (target) {
        matrix = multiply(matrix, [
          1,
          0,
          0,
          1,
          parseFloat(el.getAttribute("x") || "0") || 0,
          parseFloat(el.getAttribute("y") || "0") || 0,
        ]);
        if (target.localName === "symbol") {
          for (const c of Array.from(target.children))
            walk(c, { ...ctx, matrix, style }, depth + 1);
        } else walk(target, { ...ctx, matrix, style }, depth + 1);
      }
      return;
    }

    if (name === "g" || name === "svg" || name === "a" || name === "switch") {
      const childMatrix =
        name === "svg" && depth > 0
          ? multiply(matrix, [
              1,
              0,
              0,
              1,
              parseFloat(el.getAttribute("x") || "0") || 0,
              parseFloat(el.getAttribute("y") || "0") || 0,
            ])
          : matrix;
      for (const c of Array.from(el.children))
        walk(c, { ...ctx, matrix: childMatrix, style }, depth + 1);
      return;
    }

    const raw = shapeToSubpaths(el);
    if (!raw || raw.length === 0) return;

    const fillColor =
      style.fill === undefined
        ? "#000000"
        : style.fill === "none"
          ? null
          : resolveFill(style.fill);
    const strokeColor =
      !style.stroke || style.stroke === "none"
        ? null
        : resolveFill(style.stroke);
    const swUser = style["stroke-width"]
      ? (parseLength(style["stroke-width"])?.value ?? 1)
      : 1;
    const strokeWidthMm = swUser * meanScale(matrix);
    const polylines = flattenSubpaths(raw, matrix, 0.05);
    const label = labelOf(el);
    const fillRule = style["fill-rule"] === "evenodd" ? "evenodd" : "nonzero";
    const isOpenOnly = ["line", "polyline"].includes(name);

    if (fillColor && !isOpenOnly) {
      const rings = polylines
        .filter((p) => p.points.length >= 3)
        .map((p) => ({ points: p.points, closed: true }));
      if (rings.length) {
        const { params } = inkParams(el, "fill", 0);
        objects.push({
          id: `obj-${++counter}`,
          label,
          source: "fill",
          paths: rings,
          fillRule,
          color: fillColor,
          strokeWidth: 0,
          satinRails: false,
          params,
        });
      }
    }
    if (strokeColor) {
      const { params, satinRails } = inkParams(el, "stroke", strokeWidthMm);
      objects.push({
        id: `obj-${++counter}`,
        label: fillColor && !isOpenOnly ? `${label} (contour)` : label,
        source: "stroke",
        paths: polylines.filter((p) => p.points.length >= 2),
        fillRule,
        color: strokeColor,
        strokeWidth: strokeWidthMm,
        satinRails: satinRails && raw.length >= 2,
        params,
      });
    }
  };

  walk(root, { matrix: rootMatrix, style: {}, mmPerUnit: sx }, 0);

  if (objects.length === 0) {
    warnings.push("Aucun objet brodable trouvé dans ce SVG.");
  }
  void fileLabel;
  return {
    objects,
    widthMm,
    heightMm,
    warnings,
    hasInkstitchParams: hasInkstitch,
  };
}
