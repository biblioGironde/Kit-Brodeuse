import { useCallback, useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePatternStore } from "../../stores/usePatternStore";
import type { PesPatternData } from "../../formats/import/pesImporter";
import { DigitizerDialog } from "./DigitizerDialog";

/** Carte d'accès au module « Préparer un motif » (SVG → broderie). */
export function DigitizerCard() {
  const [open, setOpen] = useState(false);
  const setPattern = usePatternStore((s) => s.setPattern);

  const onUse = useCallback(
    (data: PesPatternData, fileName: string) => setPattern(data, fileName),
    [setPattern],
  );

  return (
    <>
      <Card className="p-0 gap-0 border-l-4 border-accent-500 dark:border-accent-600">
        <CardContent className="p-4 rounded-lg">
          <div className="flex items-start gap-3 mb-3">
            <SparklesIcon className="w-6 h-6 flex-shrink-0 mt-0.5 text-accent-600 dark:text-accent-400" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Préparer un motif
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Transformez un dessin SVG en broderie : remplissage, satin,
                point droit. Export PES, DST, JEF…
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setOpen(true)}
          >
            Ouvrir l'atelier de préparation
          </Button>
        </CardContent>
      </Card>
      <DigitizerDialog
        open={open}
        onClose={() => setOpen(false)}
        onUsePattern={onUse}
      />
    </>
  );
}
