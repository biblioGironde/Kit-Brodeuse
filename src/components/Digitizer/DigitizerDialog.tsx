/**
 * « Préparer un motif » — module de numérisation SVG → broderie
 * (équivalent simplifié de l'extension Ink/Stitch pour Inkscape).
 */
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PauseIcon,
  PlayIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseSvg } from "../../digitizer/svgDocument";
import {
  centerPlan,
  designBounds,
  estimateMinutes,
  planDesign,
  serializePlan,
  transformObjects,
} from "../../digitizer/digitize";
import { exportInkstitchSvg } from "../../digitizer/svgExport";
import { SAMPLES } from "../../digitizer/samples";
import {
  cloneParams,
  DEFAULT_PARAMS,
  type DesignObject,
  type ObjectParams,
  type StitchKind,
} from "../../digitizer/types";
import { patternConverterClient } from "../../formats/import/client";
import {
  convertPesToPen,
  type PesPatternData,
} from "../../formats/import/pesImporter";
import { PreviewCanvas } from "./PreviewCanvas";
import { ObjectEditor } from "./ObjectEditor";
import { KIND_LABELS, kindOptions } from "./kinds";

const HOOPS = [
  { mm: 100, label: "Cercle 100 × 100 mm" },
  { mm: 70, label: "Cercle 70 × 70 mm" },
];

const FORMATS = [
  { ext: "pes", label: "PES (Brother)" },
  { ext: "dst", label: "DST (Tajima)" },
  { ext: "jef", label: "JEF (Janome)" },
  { ext: "exp", label: "EXP (Melco)" },
  { ext: "vp3", label: "VP3 (Pfaff / Husqvarna)" },
];

const FABRICS = [
  { color: "#f4efe6", label: "Lin" },
  { color: "#ffffff", label: "Blanc" },
  { color: "#2b2f36", label: "Noir" },
  { color: "#1f3a5f", label: "Marine" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appelé avec le motif prêt à être envoyé à la machine */
  onUsePattern?: (data: PesPatternData, fileName: string) => void;
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DigitizerDialog({ open, onClose, onUsePattern }: Props) {
  const [name, setName] = useState("motif");
  const [objects, setObjects] = useState<DesignObject[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoop, setHoop] = useState(100);
  const [targetWidth, setTargetWidth] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showJumps, setShowJumps] = useState(true);
  const [realistic, setRealistic] = useState(true);
  const [fabric, setFabric] = useState(FABRICS[0].color);
  const [simulate, setSimulate] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [format, setFormat] = useState("pes");
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // --- Géométrie d'origine (mm) et échelle
  const naturalBounds = useMemo(() => designBounds(objects), [objects]);
  const naturalW = Math.max(0.01, naturalBounds.maxX - naturalBounds.minX);
  const naturalH = Math.max(0.01, naturalBounds.maxY - naturalBounds.minY);
  const scale = targetWidth > 0 ? targetWidth / naturalW : 1;

  const loadSvg = useCallback(
    (text: string, fileName: string) => {
      try {
        const d = parseSvg(text, fileName);
        setObjects(d.objects);
        setImportWarnings(d.warnings);
        setHasInk(d.hasInkstitchParams);
        setName(fileName.replace(/\.[^.]+$/, "") || "motif");
        setError(null);
        setSimulate(null);
        setPlaying(false);
        setExpanded(null);
        // Ajustement automatique au cercle si le dessin dépasse
        const b = designBounds(d.objects);
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        const max = hoop - 6;
        if (w > max || h > max)
          setTargetWidth(Math.round(((w * max) / Math.max(w, h)) * 10) / 10);
        else setTargetWidth(Math.round(w * 10) / 10);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [hoop],
  );

  const onFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
        setError(
          "Choisissez un fichier SVG (dessin vectoriel). Pour un fichier .PES, utilisez « Choose PES File ».",
        );
        return;
      }
      loadSvg(await file.text(), file.name);
    },
    [loadSvg],
  );

  // --- Calcul des points (différé pour garder l'interface fluide)
  const transformed = useMemo(
    () => transformObjects(objects, { scale, mirrorX: mirror }),
    [objects, scale, mirror],
  );
  const deferred = useDeferredValue(transformed);
  const { plan, offset } = useMemo(() => {
    if (!deferred.length) return { plan: null, offset: { x: 0, y: 0 } };
    try {
      const raw = planDesign(deferred);
      return {
        plan: centerPlan(raw),
        offset: {
          x: (raw.bounds.minX + raw.bounds.maxX) / 2,
          y: (raw.bounds.minY + raw.bounds.maxY) / 2,
        },
      };
    } catch (e) {
      console.error("[Digitizer]", e);
      return { plan: null, offset: { x: 0, y: 0 } };
    }
  }, [deferred]);
  const computing = deferred !== transformed;

  const sizeW = plan ? plan.bounds.maxX - plan.bounds.minX : 0;
  const sizeH = plan ? plan.bounds.maxY - plan.bounds.minY : 0;
  const tooBig = plan ? sizeW > hoop || sizeH > hoop : false;

  // Contour de l'objet survolé, dans le même repère que l'aperçu
  const highlight = useMemo(() => {
    if (!hovered || !plan) return null;
    const o = transformed.find((x) => x.id === hovered);
    if (!o) return null;
    return o.paths.map((p) => ({
      closed: p.closed,
      points: p.points.map((q) => ({ x: q.x - offset.x, y: q.y - offset.y })),
    }));
  }, [hovered, transformed, plan, offset]);

  // --- Simulateur
  useEffect(() => {
    if (!playing || !plan) return;
    let raf = 0;
    const speed = Math.max(4, Math.round(plan.stitchCount / 600));
    const tick = () => {
      setSimulate((v) => {
        const next = (v ?? 0) + speed;
        if (next >= plan.stitchCount) {
          setPlaying(false);
          return plan.stitchCount;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan]);

  useEffect(() => {
    if (!open) setPlaying(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const updateParams = (id: string, params: ObjectParams) =>
    setObjects((list) => list.map((o) => (o.id === id ? { ...o, params } : o)));

  const setKind = (o: DesignObject, kind: StitchKind) => {
    const p = cloneParams(o.params);
    p.kind = kind;
    if (kind === "satin" && !o.satinRails && o.source === "stroke")
      p.satin.width = Math.max(p.satin.width, DEFAULT_PARAMS.satin.width / 2);
    updateParams(o.id, p);
  };

  const setColor = (id: string, color: string) =>
    setObjects((list) => list.map((o) => (o.id === id ? { ...o, color } : o)));

  const moveObject = (id: string, dir: -1 | 1) =>
    setObjects((list) => {
      const i = list.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = list.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  /** Regroupe les objets de même couleur (moins de changements de fil). */
  const groupByColor = () =>
    setObjects((list) => {
      const order: string[] = [];
      list.forEach(
        (o) =>
          !order.includes(o.color.toLowerCase()) &&
          order.push(o.color.toLowerCase()),
      );
      return [...list].sort(
        (a, b) =>
          order.indexOf(a.color.toLowerCase()) -
          order.indexOf(b.color.toLowerCase()),
      );
    });

  const writeFile = async (ext: string) => {
    if (!plan) throw new Error("Aucun point à exporter");
    const { stitches, colors } = serializePlan(plan);
    return patternConverterClient.writeEmbroidery(stitches, colors, ext);
  };

  const handleDownload = async () => {
    setBusy("Écriture du fichier…");
    try {
      const data = await writeFile(format);
      download(
        data as BlobPart,
        `${name}.${format}`,
        "application/octet-stream",
      );
    } catch (e) {
      setError(`Export impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  const handleUse = async () => {
    if (!onUsePattern) return;
    setBusy("Préparation pour la machine…");
    try {
      const data = await writeFile("pes");
      const file = new File([data as BlobPart], `${name}.pes`, {
        type: "application/octet-stream",
      });
      const pes = await convertPesToPen(file);
      onUsePattern(pes, file.name);
      onClose();
    } catch (e) {
      setError(`Conversion impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSvgExport = () => {
    download(
      exportInkstitchSvg(transformObjects(objects, { scale, mirrorX: mirror })),
      `${name}-inkstitch.svg`,
      "image/svg+xml",
    );
  };

  if (!open) return null;

  const warnings = [...importWarnings, ...(plan?.warnings ?? [])];
  const colorCount = plan?.blocks.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Préparer un motif"
    >
      <div className="bg-white dark:bg-gray-900 w-full max-w-[1400px] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* En-tête */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Préparer un motif
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Transformez un dessin SVG en points de broderie — remplissage,
              satin, point droit (compatible Ink/Stitch)
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[400px_1fr] overflow-y-auto lg:overflow-hidden">
          {/* Colonne de gauche */}
          <aside className="lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 p-4 space-y-4">
            {/* Import */}
            <section
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFile(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-lg border-2 border-dashed p-3 text-center transition-colors ${dragOver ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-300 dark:border-gray-600"}`}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                onClick={() => fileInput.current?.click()}
                className="w-full"
              >
                <ArrowUpTrayIcon className="w-4 h-4" /> Ouvrir un dessin SVG
              </Button>
              <p className="text-[11px] text-gray-500 mt-2">
                ou glissez-déposez un fichier ici · ou partez d'un exemple :
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                {SAMPLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSvg(s.svg, `${s.name}.svg`)}
                    className="text-xs rounded-full border border-gray-300 dark:border-gray-600 px-2.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </section>

            {error && (
              <div className="rounded-md bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 p-2 text-xs text-danger-800 dark:text-danger-200">
                {error}
              </div>
            )}

            {objects.length > 0 && (
              <>
                {/* Taille */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Taille et cercle
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex flex-col gap-1">
                      <span className="text-gray-600 dark:text-gray-400">
                        Largeur (mm)
                      </span>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        step={1}
                        value={targetWidth}
                        onChange={(e) =>
                          setTargetWidth(
                            Math.max(1, parseFloat(e.target.value) || 1),
                          )
                        }
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-gray-600 dark:text-gray-400">
                        Hauteur (mm)
                      </span>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        step={1}
                        value={Math.round(naturalH * scale * 10) / 10}
                        onChange={(e) =>
                          setTargetWidth(
                            Math.max(
                              1,
                              ((parseFloat(e.target.value) || 1) * naturalW) /
                                naturalH,
                            ),
                          )
                        }
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      <span className="text-gray-600 dark:text-gray-400">
                        Cercle à broder
                      </span>
                      <select
                        value={hoop}
                        onChange={(e) => setHoop(parseInt(e.target.value, 10))}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      >
                        {HOOPS.map((h) => (
                          <option key={h.mm} value={h.mm}>
                            {h.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setTargetWidth(
                          Math.round(
                            (((hoop - 6) * naturalW) /
                              Math.max(naturalW, naturalH)) *
                              10,
                          ) / 10,
                        )
                      }
                    >
                      Ajuster au cercle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setTargetWidth(Math.round(naturalW * 10) / 10)
                      }
                    >
                      Taille d'origine
                    </Button>
                    <Button
                      size="sm"
                      variant={mirror ? "default" : "outline"}
                      onClick={() => setMirror((m) => !m)}
                    >
                      Miroir
                    </Button>
                  </div>
                </section>

                {/* Objets */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Objets ({objects.length}) — ordre de broderie
                    </h3>
                    <button
                      onClick={groupByColor}
                      className="text-[11px] text-primary-600 hover:underline"
                      title="Moins de changements de fil"
                    >
                      Regrouper par couleur
                    </button>
                  </div>
                  {hasInk && (
                    <p className="text-[11px] text-success-700 dark:text-success-300">
                      Paramètres Ink/Stitch du fichier repris.
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {objects.map((o, i) => (
                      <li
                        key={o.id}
                        onMouseEnter={() => setHovered(o.id)}
                        onMouseLeave={() =>
                          setHovered((h) => (h === o.id ? null : h))
                        }
                        className={`rounded-md border px-2 py-1.5 ${o.params.kind === "ignore" ? "opacity-50" : ""} ${expanded === o.id ? "border-primary-400 dark:border-primary-600" : "border-gray-200 dark:border-gray-700"}`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setExpanded((e) => (e === o.id ? null : o.id))
                            }
                            className="text-gray-500"
                            aria-label="Paramètres"
                            aria-expanded={expanded === o.id}
                          >
                            {expanded === o.id ? (
                              <ChevronDownIcon className="w-4 h-4" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4" />
                            )}
                          </button>
                          <input
                            type="color"
                            value={o.color}
                            onChange={(e) => setColor(o.id, e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                            title="Couleur du fil"
                          />
                          <span
                            className="flex-1 min-w-0 truncate text-xs text-gray-800 dark:text-gray-200"
                            title={o.label}
                          >
                            {o.label}
                          </span>
                          <select
                            value={o.params.kind}
                            onChange={(e) =>
                              setKind(o, e.target.value as StitchKind)
                            }
                            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5"
                          >
                            {kindOptions(o).map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABELS[k]}
                              </option>
                            ))}
                          </select>
                          <span className="flex flex-col leading-none">
                            <button
                              disabled={i === 0}
                              onClick={() => moveObject(o.id, -1)}
                              className="text-[10px] text-gray-500 disabled:opacity-30"
                              aria-label="Monter"
                            >
                              ▲
                            </button>
                            <button
                              disabled={i === objects.length - 1}
                              onClick={() => moveObject(o.id, 1)}
                              className="text-[10px] text-gray-500 disabled:opacity-30"
                              aria-label="Descendre"
                            >
                              ▼
                            </button>
                          </span>
                        </div>
                        {expanded === o.id && (
                          <ObjectEditor
                            object={o}
                            onChange={(p) => updateParams(o.id, p)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setObjects((list) => {
                          const anyOn = list.some(
                            (x) =>
                              x.params.kind === "fill" &&
                              x.params.fill.underlay,
                          );
                          return list.map((o) =>
                            o.params.kind === "fill"
                              ? {
                                  ...o,
                                  params: {
                                    ...o.params,
                                    fill: {
                                      ...o.params.fill,
                                      underlay: !anyOn,
                                    },
                                  },
                                }
                              : o,
                          );
                        })
                      }
                    >
                      Sous-couches on/off
                    </Button>
                  </div>
                </section>

                {warnings.length > 0 && (
                  <section className="rounded-md bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 p-2 space-y-1">
                    {warnings.map((w, i) => (
                      <p
                        key={i}
                        className="text-xs text-warning-800 dark:text-warning-200 flex gap-1.5"
                      >
                        <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{" "}
                        {w}
                      </p>
                    ))}
                  </section>
                )}
              </>
            )}
          </aside>

          {/* Aperçu */}
          <main className="flex flex-col min-h-[420px] lg:min-h-0 p-4 gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={realistic}
                  onChange={(e) => setRealistic(e.target.checked)}
                />{" "}
                Rendu réaliste
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showJumps}
                  onChange={(e) => setShowJumps(e.target.checked)}
                />{" "}
                Afficher les sauts
              </label>
              <span className="flex items-center gap-1">
                Tissu :
                {FABRICS.map((f) => (
                  <button
                    key={f.color}
                    title={f.label}
                    onClick={() => setFabric(f.color)}
                    className={`w-5 h-5 rounded-full border ${fabric === f.color ? "ring-2 ring-primary-500" : "border-gray-400"}`}
                    style={{ background: f.color }}
                  />
                ))}
              </span>
              {computing && (
                <span className="flex items-center gap-1 text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> calcul…
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 rounded-lg bg-gray-100 dark:bg-gray-800 relative">
              {objects.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                  Ouvrez un dessin SVG ou choisissez un exemple pour voir
                  l'aperçu de la broderie.
                </div>
              ) : (
                <PreviewCanvas
                  plan={plan}
                  hoopMm={hoop}
                  upTo={simulate}
                  showJumps={showJumps}
                  realistic={realistic}
                  fabric={fabric}
                  highlight={highlight}
                />
              )}
            </div>

            {plan && (
              <>
                {/* Simulateur */}
                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={playing ? "Pause" : "Lecture"}
                    onClick={() => {
                      if (
                        !playing &&
                        (simulate == null || simulate >= plan.stitchCount)
                      )
                        setSimulate(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? (
                      <PauseIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={plan.stitchCount}
                    value={simulate ?? plan.stitchCount}
                    onChange={(e) => {
                      setPlaying(false);
                      const v = parseInt(e.target.value, 10);
                      setSimulate(v >= plan.stitchCount ? null : v);
                    }}
                    className="flex-1"
                    aria-label="Simulateur de broderie"
                  />
                  <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400 w-28 text-right">
                    {(simulate ?? plan.stitchCount).toLocaleString("fr-FR")} /{" "}
                    {plan.stitchCount.toLocaleString("fr-FR")}
                  </span>
                </div>

                {/* Statistiques + actions */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <div>
                      <dt className="text-gray-500 inline">Taille </dt>
                      <dd
                        className={`inline font-semibold ${tooBig ? "text-danger-600" : "text-gray-900 dark:text-white"}`}
                      >
                        {sizeW.toFixed(1)} × {sizeH.toFixed(1)} mm
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Points </dt>
                      <dd className="inline font-semibold text-gray-900 dark:text-white">
                        {plan.stitchCount.toLocaleString("fr-FR")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Fils </dt>
                      <dd className="inline font-semibold text-gray-900 dark:text-white">
                        {colorCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Coupes </dt>
                      <dd className="inline font-semibold text-gray-900 dark:text-white">
                        {plan.trimCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Durée ≈ </dt>
                      <dd className="inline font-semibold text-gray-900 dark:text-white">
                        {Math.ceil(estimateMinutes(plan))} min
                      </dd>
                    </div>
                  </dl>
                  {tooBig && (
                    <p className="text-xs text-danger-600">
                      Le motif dépasse le cercle : réduisez la taille.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSvgExport}
                      title="SVG avec paramètres, à rouvrir ici ou dans Inkscape + Ink/Stitch"
                    >
                      SVG Ink/Stitch
                    </Button>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="h-8 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5"
                      aria-label="Format du fichier"
                    >
                      {FORMATS.map((f) => (
                        <option key={f.ext} value={f.ext}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={!!busy}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" /> Télécharger
                    </Button>
                    {onUsePattern && (
                      <Button
                        size="sm"
                        onClick={handleUse}
                        disabled={!!busy || tooBig}
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        Utiliser ce motif
                      </Button>
                    )}
                  </div>
                </div>
                {busy && <p className="text-xs text-gray-500">{busy}</p>}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
