import { describe, expect, it } from "vitest";
import { parsePathData, flattenSubpaths } from "./svgPath";
import { parseSvg } from "./svgDocument";
import { planDesign, serializePlan, transformObjects } from "./digitize";
import { tatamiFill } from "./stitches/fill";
import { runningStitch } from "./stitches/running";
import { IDENTITY, dist } from "./geometry";

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("svgPath", () => {
  it("lit les commandes relatives, absolues et les arcs compacts", () => {
    const sp = parsePathData("m10 10h10v10h-10z M0 0 a5 5 0 105 5");
    expect(sp).toHaveLength(2);
    expect(sp[0].closed).toBe(true);
    const flat = flattenSubpaths(sp, IDENTITY);
    expect(flat[0].points[2]).toEqual({ x: 20, y: 20 });
    const arcEnd = flat[1].points[flat[1].points.length - 1];
    expect(arcEnd.x).toBeCloseTo(5);
    expect(arcEnd.y).toBeCloseTo(5);
  });
});

describe("parseSvg", () => {
  it("convertit les unités en mm et sépare remplissage et contour", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 100 100">
      <g transform="translate(10,10)">
        <rect width="40" height="20" fill="red" stroke="#00f" stroke-width="4"/>
      </g>
      <text>coucou</text>
    </svg>`;
    const d = parseSvg(svg);
    expect(d.widthMm).toBeCloseTo(50);
    expect(d.objects).toHaveLength(2);
    expect(d.objects[0].source).toBe("fill");
    expect(d.objects[0].color).toBe("#ff0000");
    expect(d.objects[0].paths[0].points[0]).toEqual({ x: 5, y: 5 });
    expect(d.objects[1].strokeWidth).toBeCloseTo(2);
    expect(d.objects[1].params.kind).toBe("satin");
    expect(d.warnings.join(" ")).toMatch(/texte/);
  });

  it("lit les paramètres Ink/Stitch", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M0 0H50V50H0Z" style="fill:#123456" inkstitch:angle="45" inkstitch:row_spacing_mm="0.3" inkstitch:fill_underlay="False"/>
      <path d="M0 60H50" style="fill:none;stroke:#000;stroke-width:3" inkstitch:stroke_method="running_stitch" inkstitch:bean_stitch_repeats="2"/>
    </svg>`;
    const d = parseSvg(svg);
    expect(d.hasInkstitchParams).toBe(true);
    expect(d.objects[0].params.fill.angle).toBe(45);
    expect(d.objects[0].params.fill.rowSpacing).toBe(0.3);
    expect(d.objects[0].params.fill.underlay).toBe(false);
    expect(d.objects[1].params.kind).toBe("running");
    expect(d.objects[1].params.running.bean).toBe(2);
  });

  it("gère les classes CSS (export Illustrator)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
      <style>.cls-1{fill:#0a0;}</style><circle class="cls-1" cx="48" cy="48" r="40"/></svg>`;
    const d = parseSvg(svg);
    expect(d.objects[0].color).toBe("#00aa00");
    expect(d.widthMm).toBeCloseTo(25.4);
  });
});

describe("points", () => {
  it("le point droit respecte la longueur demandée", () => {
    const pts = runningStitch(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { length: 2.5, repeats: 1, bean: 0 },
    );
    expect(pts).toHaveLength(5);
    const triple = runningStitch(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { length: 2.5, repeats: 1, bean: 2 },
    );
    expect(triple).toHaveLength(13);
  });

  it("le remplissage tatami couvre la forme sans point trop long", () => {
    const st = tatamiFill(
      [square(0, 0, 10)],
      {
        angleDeg: 0,
        rowSpacing: 0.25,
        maxStitchLength: 4,
        staggers: 4,
        expand: 0,
        fillRule: "nonzero",
      },
      null,
    );
    expect(st.length).toBeGreaterThan(100);
    const ys = new Set(st.map((s) => s.y.toFixed(2)));
    expect(ys.size).toBeGreaterThanOrEqual(39);
    for (let i = 1; i < st.length; i++) {
      if (st[i].cmd === "stitch")
        expect(dist(st[i - 1], st[i])).toBeLessThanOrEqual(4.01);
    }
    for (const s of st) {
      expect(s.x).toBeGreaterThanOrEqual(-1e-6);
      expect(s.x).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it("le remplissage respecte les trous (anneau)", () => {
    const outer = square(0, 0, 20);
    const hole = square(5, 5, 10).reverse();
    const st = tatamiFill(
      [outer, hole],
      {
        angleDeg: 30,
        rowSpacing: 0.4,
        maxStitchLength: 3,
        staggers: 4,
        expand: 0,
        fillRule: "nonzero",
      },
      null,
    );
    const inside = st.filter(
      (s) =>
        s.cmd === "stitch" &&
        s.x > 5.5 &&
        s.x < 14.5 &&
        s.y > 5.5 &&
        s.y < 14.5,
    );
    expect(inside.length).toBe(0);
  });
});

describe("plan complet", () => {
  it("produit des blocs de couleur et une sérialisation 0,1 mm", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="15" fill="#ffcc00"/>
      <circle cx="14" cy="16" r="2" fill="#000"/>
      <circle cx="26" cy="16" r="2" fill="#000"/>
      <path d="M12 24 Q20 32 28 24" fill="none" stroke="#000" stroke-width="1.5"/>
    </svg>`;
    const d = parseSvg(svg);
    const plan = planDesign(transformObjects(d.objects, { scale: 1 }));
    expect(plan.blocks.map((b) => b.color)).toEqual(["#ffcc00", "#000000"]);
    expect(plan.stitchCount).toBeGreaterThan(1000);
    const ser = serializePlan(plan);
    expect(ser.colors).toHaveLength(2);
    expect(ser.stitches.filter((s) => s[2] === 3)).toHaveLength(1);
    expect(Math.max(...ser.stitches.map((s) => s[0]))).toBeLessThanOrEqual(360);
  });
});

describe("exemples et export SVG", () => {
  it("chaque exemple produit un plan qui tient dans le cercle 100 mm", async () => {
    const { SAMPLES } = await import("./samples");
    for (const s of SAMPLES) {
      const d = parseSvg(s.svg);
      const plan = planDesign(transformObjects(d.objects, { scale: 1 }));
      expect(plan.stitchCount, s.name).toBeGreaterThan(200);
      expect(plan.bounds.maxX - plan.bounds.minX, s.name).toBeLessThan(100);
      expect(plan.bounds.maxY - plan.bounds.minY, s.name).toBeLessThan(100);
    }
  });

  it("l'export SVG Ink/Stitch se relit avec les mêmes paramètres", async () => {
    const { exportInkstitchSvg } = await import("./svgExport");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40">
      <rect x="5" y="5" width="20" height="10" fill="#336699"/>
      <path d="M5 30 H35" fill="none" stroke="#000" stroke-width="2"/>
    </svg>`;
    const d = parseSvg(svg);
    d.objects[0].params.fill.angle = 30;
    d.objects[1].params.satin.zigzagSpacing = 0.5;
    const again = parseSvg(exportInkstitchSvg(d.objects));
    expect(again.hasInkstitchParams).toBe(true);
    expect(again.objects).toHaveLength(2);
    expect(again.objects[0].params.fill.angle).toBe(30);
    expect(again.objects[1].params.kind).toBe("satin");
    expect(again.objects[1].params.satin.zigzagSpacing).toBe(0.5);
    expect(again.objects[1].params.satin.width).toBeCloseTo(2);
  });
});
