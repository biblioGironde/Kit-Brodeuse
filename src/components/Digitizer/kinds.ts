import type { DesignObject, StitchKind } from "../../digitizer/types";

export const KIND_LABELS: Record<StitchKind, string> = {
  fill: "Remplissage",
  satin: "Satin",
  running: "Point droit",
  ignore: "Ne pas broder",
};

export function kindOptions(o: DesignObject): StitchKind[] {
  return o.source === "fill"
    ? ["fill", "running", "ignore"]
    : ["satin", "running", "ignore"];
}
