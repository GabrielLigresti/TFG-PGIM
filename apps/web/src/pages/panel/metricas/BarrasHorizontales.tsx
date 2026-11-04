import { useAncho } from './useAncho';

export interface Barra {
  id: string;
  etiqueta: string;
  valor: number;
  // Valor ya formateado, que va a la derecha de la barra.
  texto: string;
  // Aviso al pasar el cursor o mantener apretado.
  aviso: string;
}

const ALTO_BARRA = 8;
const ALTO_FILA = 32;

// Barras horizontales de una sola serie, ordenadas por quien las llama. Base en el eje,
// punta redondeada de 4 px, valor directo a la derecha. La zona de toque es la fila entera.
export function BarrasHorizontales({ barras }: { barras: Barra[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const maximo = Math.max(...barras.map((b) => b.valor), 0);
  return (
    <ul className="grid">
      {barras.map((b) => {
        const largo = maximo > 0 ? Math.max((b.valor / maximo) * ancho, b.valor > 0 ? 2 : 0) : 0;
        return (
          <li
            key={b.id}
            title={b.aviso}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-1 hover:bg-panel sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            style={{ minHeight: ALTO_FILA + 8 }}
          >
            <span className="truncate text-sm text-text">{b.etiqueta}</span>
            <span className="text-right text-sm font-medium tabular-nums text-ink sm:order-3">
              {b.texto}
            </span>
            <div ref={b === barras[0] ? ref : undefined} className="col-span-2 sm:col-span-1">
              <svg width={ancho} height={ALTO_BARRA} aria-hidden className="block">
                <path
                  d={`M0 0 H${Math.max(largo - 4, 0)} a4 4 0 0 1 4 4 a4 4 0 0 1 -4 4 H0 Z`}
                  fill={largo > 0 ? 'var(--color-meta)' : 'none'}
                />
              </svg>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
