import type { Pt } from "./geometry";
import type { Polyline } from "./svgPath";

/** Type de point appliqué à un objet (équivalents Ink/Stitch entre parenthèses). */
export type StitchKind =
  | "fill" // Remplissage tatami (auto_fill)
  | "satin" // Colonne satin (satin_column / zigzag)
  | "running" // Point droit (running_stitch)
  | "ignore"; // Objet non brodé

export interface FillParams {
  /** Angle des rangs en degrés (sens anti-horaire, 0 = horizontal) */
  angle: number;
  /** Espacement entre rangs (mm) */
  rowSpacing: number;
  /** Longueur maximale de point (mm) */
  maxStitchLength: number;
  /** Nombre de rangs avant que le motif de décalage se répète */
  staggers: number;
  /** Compensation d'étirement : allonge chaque rang (mm, ajouté à chaque extrémité / 2) */
  expand: number;
  /** Sous-couche activée */
  underlay: boolean;
  /** Angle de sous-couche (null = angle + 90°) */
  underlayAngle: number | null;
  /** Espacement des rangs de sous-couche (0 = 3 × espacement) */
  underlayRowSpacing: number;
  /** Retrait de la sous-couche par rapport au bord (mm) */
  underlayInset: number;
  /** Contour en point droit autour du remplissage */
  outline: boolean;
}

export interface SatinParams {
  /** Largeur de la colonne pour un trait converti (mm) */
  width: number;
  /** Espacement zigzag crête-à-crête (mm) */
  zigzagSpacing: number;
  /** Compensation d'étirement totale (mm) */
  pullCompensation: number;
  centerWalk: boolean;
  contourUnderlay: boolean;
  zigzagUnderlay: boolean;
}

export interface RunningParams {
  /** Longueur de point (mm) */
  length: number;
  /** Nombre de passages (1 = aller, 2 = aller-retour…) */
  repeats: number;
  /** Point triple (« bean stitch ») : nombre de répétitions supplémentaires par point (0, 2, 4…) */
  bean: number;
}

export interface ObjectParams {
  kind: StitchKind;
  fill: FillParams;
  satin: SatinParams;
  running: RunningParams;
  /** Points d'arrêt au début et à la fin */
  ties: boolean;
  /** Coupure du fil après l'objet */
  trimAfter: boolean;
}

export interface DesignObject {
  id: string;
  label: string;
  /** Origine dans le SVG : surface remplie ou trait */
  source: "fill" | "stroke";
  /** Géométrie en mm (anneaux fermés pour un remplissage, polylignes pour un trait) */
  paths: Polyline[];
  /** Règle de remplissage SVG */
  fillRule: "nonzero" | "evenodd";
  color: string;
  /** Épaisseur de trait en mm (0 pour une surface) */
  strokeWidth: number;
  /** Colonne satin Ink/Stitch à deux rails */
  satinRails: boolean;
  params: ObjectParams;
}

export interface ParsedDesign {
  objects: DesignObject[];
  widthMm: number;
  heightMm: number;
  warnings: string[];
  /** Le fichier contenait des paramètres Ink/Stitch */
  hasInkstitchParams: boolean;
}

export type StitchCommand = "stitch" | "jump" | "trim";

export interface PlannedStitch extends Pt {
  cmd: StitchCommand;
}

export interface ColorBlock {
  color: string;
  stitches: PlannedStitch[];
}

export interface StitchPlan {
  blocks: ColorBlock[];
  stitchCount: number;
  jumpCount: number;
  trimCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  warnings: string[];
}

export const DEFAULT_PARAMS: ObjectParams = {
  kind: "fill",
  fill: {
    angle: 0,
    rowSpacing: 0.25,
    maxStitchLength: 4,
    staggers: 4,
    expand: 0,
    underlay: true,
    underlayAngle: null,
    underlayRowSpacing: 0,
    underlayInset: 0.3,
    outline: false,
  },
  satin: {
    width: 3,
    zigzagSpacing: 0.4,
    pullCompensation: 0.2,
    centerWalk: true,
    contourUnderlay: false,
    zigzagUnderlay: false,
  },
  running: { length: 2.5, repeats: 1, bean: 0 },
  ties: true,
  trimAfter: false,
};

export function cloneParams(p: ObjectParams): ObjectParams {
  return {
    ...p,
    fill: { ...p.fill },
    satin: { ...p.satin },
    running: { ...p.running },
  };
}
