/**
 * Paramètres d'un objet (équivalent de la boîte « Paramètres » d'Ink/Stitch).
 */
import type { ReactNode } from "react";
import type { DesignObject, ObjectParams } from "../../digitizer/types";

const inputCls =
  "w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs text-right";

function NumField({
  label,
  value,
  onChange,
  step = 0.05,
  min,
  max,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <label
      className="flex items-center justify-between gap-2 text-xs"
      title={hint}
    >
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className={inputCls}
          value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v))
              onChange(
                min != null
                  ? Math.max(min, max != null ? Math.min(max, v) : v)
                  : v,
              );
          }}
        />
        <span className="w-7 text-gray-500">{unit}</span>
      </span>
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label
      className="flex items-center justify-between gap-2 text-xs cursor-pointer"
      title={hint}
    >
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary-600"
      />
    </label>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-2">
    <legend className="text-[11px] uppercase tracking-wide text-gray-500 pr-1">
      {title}
    </legend>
    {children}
  </fieldset>
);

export function ObjectEditor({
  object,
  onChange,
}: {
  object: DesignObject;
  onChange: (params: ObjectParams) => void;
}) {
  const p = object.params;
  const set = (patch: Partial<ObjectParams>) => onChange({ ...p, ...patch });
  const setFill = (patch: Partial<ObjectParams["fill"]>) =>
    set({ fill: { ...p.fill, ...patch } });
  const setSatin = (patch: Partial<ObjectParams["satin"]>) =>
    set({ satin: { ...p.satin, ...patch } });
  const setRun = (patch: Partial<ObjectParams["running"]>) =>
    set({ running: { ...p.running, ...patch } });

  return (
    <div className="space-y-2 pt-2">
      {p.kind === "fill" && (
        <>
          <Group title="Remplissage tatami">
            <NumField
              label="Angle des rangs"
              value={p.fill.angle}
              step={5}
              unit="°"
              onChange={(v) => setFill({ angle: v })}
              hint="0 = horizontal, sens anti-horaire"
            />
            <NumField
              label="Espacement des rangs"
              value={p.fill.rowSpacing}
              min={0.1}
              max={2}
              unit="mm"
              onChange={(v) => setFill({ rowSpacing: v })}
              hint="Plus petit = plus dense (0,25 mm par défaut)"
            />
            <NumField
              label="Longueur max. de point"
              value={p.fill.maxStitchLength}
              step={0.5}
              min={1}
              max={7}
              unit="mm"
              onChange={(v) => setFill({ maxStitchLength: v })}
            />
            <NumField
              label="Décalage (rangs)"
              value={p.fill.staggers}
              step={1}
              min={1}
              max={10}
              onChange={(v) => setFill({ staggers: Math.round(v) })}
              hint="Nombre de rangs avant répétition du décalage des points"
            />
            <NumField
              label="Compensation d'étirement"
              value={p.fill.expand}
              step={0.1}
              min={-2}
              max={2}
              unit="mm"
              onChange={(v) => setFill({ expand: v })}
            />
          </Group>
          <Group title="Sous-couche">
            <Toggle
              label="Sous-couche"
              value={p.fill.underlay}
              onChange={(v) => setFill({ underlay: v })}
              hint="Stabilise le tissu avant le remplissage"
            />
            {p.fill.underlay && (
              <>
                <NumField
                  label="Angle (vide = +90°)"
                  value={p.fill.underlayAngle ?? p.fill.angle + 90}
                  step={5}
                  unit="°"
                  onChange={(v) => setFill({ underlayAngle: v })}
                />
                <NumField
                  label="Espacement"
                  value={p.fill.underlayRowSpacing || p.fill.rowSpacing * 3}
                  step={0.1}
                  min={0.3}
                  unit="mm"
                  onChange={(v) => setFill({ underlayRowSpacing: v })}
                />
                <NumField
                  label="Retrait du bord"
                  value={p.fill.underlayInset}
                  step={0.1}
                  min={0}
                  max={3}
                  unit="mm"
                  onChange={(v) => setFill({ underlayInset: v })}
                />
              </>
            )}
            <Toggle
              label="Contour en point droit"
              value={p.fill.outline}
              onChange={(v) => setFill({ outline: v })}
            />
          </Group>
        </>
      )}

      {p.kind === "satin" && (
        <>
          <Group
            title={
              object.satinRails
                ? "Colonne satin (2 rails)"
                : "Satin le long du trait"
            }
          >
            {!object.satinRails && (
              <NumField
                label="Largeur"
                value={p.satin.width}
                step={0.2}
                min={0.5}
                max={12}
                unit="mm"
                onChange={(v) => setSatin({ width: v })}
              />
            )}
            <NumField
              label="Espacement zigzag"
              value={p.satin.zigzagSpacing}
              step={0.05}
              min={0.2}
              max={3}
              unit="mm"
              onChange={(v) => setSatin({ zigzagSpacing: v })}
              hint="Crête à crête : 0,4 mm par défaut"
            />
            <NumField
              label="Compensation d'étirement"
              value={p.satin.pullCompensation}
              step={0.05}
              min={0}
              max={2}
              unit="mm"
              onChange={(v) => setSatin({ pullCompensation: v })}
            />
          </Group>
          <Group title="Sous-couche">
            <Toggle
              label="Marche centrale"
              value={p.satin.centerWalk}
              onChange={(v) => setSatin({ centerWalk: v })}
            />
            <Toggle
              label="Contour"
              value={p.satin.contourUnderlay}
              onChange={(v) => setSatin({ contourUnderlay: v })}
            />
            <Toggle
              label="Zigzag"
              value={p.satin.zigzagUnderlay}
              onChange={(v) => setSatin({ zigzagUnderlay: v })}
            />
          </Group>
        </>
      )}

      {(p.kind === "running" || (p.kind === "fill" && p.fill.outline)) && (
        <Group title="Point droit">
          <NumField
            label="Longueur de point"
            value={p.running.length}
            step={0.1}
            min={0.5}
            max={6}
            unit="mm"
            onChange={(v) => setRun({ length: v })}
          />
          <NumField
            label="Passages"
            value={p.running.repeats}
            step={1}
            min={1}
            max={5}
            onChange={(v) => setRun({ repeats: Math.round(v) })}
            hint="2 = aller-retour"
          />
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-700 dark:text-gray-300">Type</span>
            <select
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs"
              value={p.running.bean}
              onChange={(e) => setRun({ bean: parseInt(e.target.value, 10) })}
            >
              <option value={0}>Simple</option>
              <option value={2}>Triple (bean)</option>
              <option value={4}>Quintuple</option>
            </select>
          </label>
        </Group>
      )}

      {p.kind !== "ignore" && (
        <Group title="Fil">
          <Toggle
            label="Points d'arrêt"
            value={p.ties}
            onChange={(v) => set({ ties: v })}
          />
          <Toggle
            label="Couper le fil après"
            value={p.trimAfter}
            onChange={(v) => set({ trimAfter: v })}
          />
        </Group>
      )}
    </div>
  );
}
