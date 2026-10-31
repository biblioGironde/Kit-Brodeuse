/**
 * Aperçu des points de broderie dans le cercle (avec simulateur pas à pas).
 */
import { useEffect, useRef } from "react";
import type { StitchPlan } from "../../digitizer/types";
import type { Polyline } from "../../digitizer/svgPath";

interface Props {
  plan: StitchPlan | null;
  hoopMm: number;
  /** Nombre de points à afficher (simulateur) ; null = tout */
  upTo: number | null;
  showJumps: boolean;
  realistic: boolean;
  fabric: string;
  /** Contours de l'objet survolé (déjà recentrés) */
  highlight: Polyline[] | null;
}

export function PreviewCanvas({
  plan,
  hoopMm,
  upTo,
  showJumps,
  realistic,
  fabric,
  highlight,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = Math.max(200, Math.min(wrap.clientWidth, wrap.clientHeight));
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const view = hoopMm * 1.12;
      const k = size / view;
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(k, k);

      // Tissu + cercle à broder
      ctx.fillStyle = fabric;
      ctx.beginPath();
      ctx.roundRect(
        -hoopMm / 2 - 3,
        -hoopMm / 2 - 3,
        hoopMm + 6,
        hoopMm + 6,
        6,
      );
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#8a8f98";
      ctx.stroke();
      // grille 10 mm
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      for (let v = -hoopMm / 2; v <= hoopMm / 2 + 1e-6; v += 10) {
        ctx.beginPath();
        ctx.moveTo(v, -hoopMm / 2);
        ctx.lineTo(v, hoopMm / 2);
        ctx.moveTo(-hoopMm / 2, v);
        ctx.lineTo(hoopMm / 2, v);
        ctx.stroke();
      }
      ctx.lineWidth = 0.25;
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.moveTo(0, -4);
      ctx.lineTo(0, 4);
      ctx.stroke();

      if (plan) {
        let count = 0;
        const limit = upTo ?? Infinity;
        let lastPoint: { x: number; y: number } | null = null;
        outer: for (const block of plan.blocks) {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          let prev: { x: number; y: number } | null = null;
          for (const s of block.stitches) {
            if (count >= limit) break outer;
            if (s.cmd === "trim") {
              prev = null;
              continue;
            }
            if (s.cmd === "jump" || !prev) {
              if (prev && showJumps) {
                ctx.save();
                ctx.setLineDash([0.8, 0.8]);
                ctx.lineWidth = 0.12;
                ctx.strokeStyle = "rgba(220,30,30,0.7)";
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(s.x, s.y);
                ctx.stroke();
                ctx.restore();
              }
              prev = s;
              continue;
            }
            if (realistic) {
              ctx.lineWidth = 0.42;
              ctx.strokeStyle = "rgba(0,0,0,0.25)";
              ctx.beginPath();
              ctx.moveTo(prev.x + 0.06, prev.y + 0.06);
              ctx.lineTo(s.x + 0.06, s.y + 0.06);
              ctx.stroke();
            }
            ctx.lineWidth = realistic ? 0.36 : 0.18;
            ctx.strokeStyle = block.color;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
            prev = s;
            lastPoint = s;
            count++;
          }
        }
        if (upTo != null && lastPoint) {
          ctx.fillStyle = "#e11d48";
          ctx.beginPath();
          ctx.arc(lastPoint.x, lastPoint.y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (highlight) {
        ctx.save();
        ctx.setLineDash([1.2, 0.8]);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "#2563eb";
        for (const p of highlight) {
          ctx.beginPath();
          p.points.forEach((q, i) =>
            i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y),
          );
          if (p.closed) ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [plan, hoopMm, upTo, showJumps, realistic, fabric, highlight]);

  return (
    <div
      ref={wrapRef}
      className="w-full h-full min-h-[260px] flex items-center justify-center"
    >
      <canvas ref={ref} aria-label="Aperçu de la broderie" />
    </div>
  );
}
