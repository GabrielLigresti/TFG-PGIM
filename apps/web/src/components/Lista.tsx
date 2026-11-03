import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export interface Columna<T> {
  titulo: string;
  valor(fila: T): ReactNode;
  // En el celular, la primera columna es el título de la tarjeta.
  className?: string;
}

interface Props<T> {
  filas: T[];
  columnas: Columna<T>[];
  clave(fila: T): string;
  acciones?(fila: T): ReactNode;
  inactiva?(fila: T): boolean;
  // Hace clickeable la fila (o la tarjeta), también con el teclado.
  onSeleccionar?(fila: T): void;
  etiquetaSeleccion?(fila: T): string;
  vacio?: ReactNode;
  // Compacta en escritorio; táctil para tablets de cocina y salón.
  densidad?: 'compacta' | 'tactil';
  seleccionada?(fila: T): boolean;
  // Presentación propia de la tarjeta del celular, en lugar del título y la lista de campos.
  tarjeta?(fila: T): ReactNode;
}

function propsSeleccion<T>(fila: T, onSeleccionar?: (fila: T) => void, etiqueta?: string) {
  if (!onSeleccionar) return {};
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': etiqueta,
    onClick: () => onSeleccionar(fila),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      onSeleccionar(fila);
    },
  };
}

// Los botones de acción no disparan la selección de la fila.
const frenar = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

// Tabla en la PC y tarjetas en el celular, con las mismas columnas.
export function Lista<T>({
  filas,
  columnas,
  clave,
  acciones,
  inactiva,
  onSeleccionar,
  etiquetaSeleccion,
  vacio,
  densidad = 'compacta',
  seleccionada,
  tarjeta,
}: Props<T>) {
  const clickeable = onSeleccionar ? 'cursor-pointer hover:bg-panel' : '';
  if (filas.length === 0) {
    if (vacio && typeof vacio !== 'string') return vacio;
    return <p className="text-sm text-meta">{vacio ?? 'Todavía no hay registros.'}</p>;
  }
  const [principal, ...resto] = columnas;
  const celda = densidad === 'tactil' ? 'px-4 py-3 text-base' : 'px-4 py-2 text-sm';
  const marcada = (fila: T) =>
    seleccionada?.(fila) ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : '';

  return (
    <>
      <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface md:block">
        <table className="w-full text-left">
          <thead className="border-b border-line bg-bg text-xs text-meta">
            <tr>
              {columnas.map((c) => (
                <th key={c.titulo} className="px-4 py-2 font-semibold">
                  {c.titulo}
                </th>
              ))}
              {acciones && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filas.map((fila) => (
              <tr
                key={clave(fila)}
                {...propsSeleccion(fila, onSeleccionar, etiquetaSeleccion?.(fila))}
                className={`${inactiva?.(fila) ? 'text-meta' : 'text-text'} ${marcada(fila)} ${clickeable}`}
              >
                {columnas.map((c) => (
                  <td key={c.titulo} className={`${celda} align-middle ${c.className ?? ''}`}>
                    {c.valor(fila)}
                  </td>
                ))}
                {acciones && (
                  <td
                    className={`${celda} text-right whitespace-nowrap`}
                    onClick={frenar}
                    onKeyDown={frenar}
                  >
                    {acciones(fila)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {filas.map((fila) => (
          <li
            key={clave(fila)}
            {...propsSeleccion(fila, onSeleccionar, etiquetaSeleccion?.(fila))}
            className={`rounded-panel border border-line bg-surface p-4 ${inactiva?.(fila) ? 'opacity-60' : ''} ${marcada(fila)} ${clickeable}`}
          >
            {tarjeta ? (
              tarjeta(fila)
            ) : (
              <>
                <div className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
                  {principal?.valor(fila)}
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  {resto.map((c) => (
                    <div key={c.titulo} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-meta">{c.titulo}</dt>
                      <dd className="min-w-0 text-right text-text [overflow-wrap:anywhere]">
                        {c.valor(fila)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {acciones && (
              <div className="mt-3 flex flex-wrap gap-2" onClick={frenar} onKeyDown={frenar}>
                {acciones(fila)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
