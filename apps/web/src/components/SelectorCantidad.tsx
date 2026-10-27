import { Minus, Plus } from 'lucide-react';
import { MAX_CANTIDAD_LINEA } from '@pgim/shared';

const claseBoton =
  'grid size-11 place-items-center rounded-control border border-line-strong bg-surface text-text hover:bg-panel disabled:opacity-40';

// Cantidad de un plato, de 1 a 20, con botones de 44 px para el pulgar.
export function SelectorCantidad({
  valor,
  onChange,
  nombre,
}: {
  valor: number;
  onChange(valor: number): void;
  nombre: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label={`Cantidad de ${nombre}`}
    >
      <button
        type="button"
        className={claseBoton}
        disabled={valor <= 1}
        onClick={() => onChange(valor - 1)}
        aria-label="Uno menos"
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" className="w-8 text-center font-semibold tabular-nums text-ink">
        {valor}
      </span>
      <button
        type="button"
        className={claseBoton}
        disabled={valor >= MAX_CANTIDAD_LINEA}
        onClick={() => onChange(valor + 1)}
        aria-label="Uno más"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
