import type { ReactNode } from 'react';

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
  vacio?: string;
}

// Tabla en la PC y tarjetas en el celular, con las mismas columnas.
export function Lista<T>({ filas, columnas, clave, acciones, inactiva, vacio }: Props<T>) {
  if (filas.length === 0) {
    return <p className="text-sm text-slate-500">{vacio ?? 'Todavía no hay registros.'}</p>;
  }
  const [principal, ...resto] = columnas;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              {columnas.map((c) => (
                <th key={c.titulo} className="px-4 py-2 font-medium">
                  {c.titulo}
                </th>
              ))}
              {acciones && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((fila) => (
              <tr
                key={clave(fila)}
                className={inactiva?.(fila) ? 'text-slate-400' : 'text-slate-700'}
              >
                {columnas.map((c) => (
                  <td key={c.titulo} className={`px-4 py-2 align-top ${c.className ?? ''}`}>
                    {c.valor(fila)}
                  </td>
                ))}
                {acciones && (
                  <td className="px-4 py-2 text-right whitespace-nowrap">{acciones(fila)}</td>
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
            className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${inactiva?.(fila) ? 'opacity-60' : ''}`}
          >
            <div className="font-medium text-slate-800">{principal?.valor(fila)}</div>
            <dl className="mt-2 space-y-1 text-sm">
              {resto.map((c) => (
                <div key={c.titulo} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{c.titulo}</dt>
                  <dd className="text-right text-slate-700">{c.valor(fila)}</dd>
                </div>
              ))}
            </dl>
            {acciones && <div className="mt-3 flex flex-wrap gap-2">{acciones(fila)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
