import { useState, type PointerEvent } from 'react';
import { formatoFecha, formatoPesosEnteros } from '../../../lib/formato';
import type { VentaDia } from './diasPeriodo';
import { useAncho } from './useAncho';

const ALTO = 220;
const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 };

const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const diaCorto = (fecha: string) => formatoFecha(fecha).slice(0, 5);

// Marcas del eje vertical: cuatro tramos con un tope "redondo" por encima del máximo.
function escala(maximo: number): { tope: number; marcas: number[] } {
  if (maximo <= 0) return { tope: 1, marcas: [0] };
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = ([1, 2, 2.5, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia;
  const marcas: number[] = [];
  for (let v = 0; v < maximo + paso; v += paso) marcas.push(v);
  return { tope: marcas[marcas.length - 1] ?? 1, marcas };
}

// Una línea de 2 px (una sola serie, sin leyenda), con cruz y aviso al pasar el cursor
// o al tocarla. El teclado y los lectores de pantalla usan "Ver como tabla".
export function GraficoVentas({ dias }: { dias: VentaDia[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>(480);
  const [activo, setActivo] = useState<number | null>(null);

  const interior = Math.max(ancho - MARGEN.izquierda - MARGEN.derecha, 1);
  const altoInterior = ALTO - MARGEN.arriba - MARGEN.abajo;
  const { tope, marcas } = escala(Math.max(...dias.map((d) => d.monto), 0));
  const x = (i: number) =>
    MARGEN.izquierda + (dias.length > 1 ? (i / (dias.length - 1)) * interior : interior / 2);
  const y = (monto: number) => MARGEN.arriba + altoInterior * (1 - monto / tope);
  const linea = dias
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.monto).toFixed(1)}`)
    .join(' ');

  // Unas cinco fechas en el eje, sin que se pisen.
  const cantidadMarcasX = Math.min(dias.length, ancho < 480 ? 3 : 6);
  const indicesX =
    dias.length <= 1
      ? [0]
      : Array.from({ length: cantidadMarcasX }, (_, k) =>
          Math.round((k * (dias.length - 1)) / (cantidadMarcasX - 1)),
        );

  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - caja.left - MARGEN.izquierda) / interior;
    setActivo(Math.min(Math.max(Math.round(rel * (dias.length - 1)), 0), dias.length - 1));
  };
  const dia = activo !== null ? dias[activo] : undefined;
  return (
    <div ref={ref} className="relative min-w-0 overflow-hidden">
      <svg
        width={ancho}
        height={ALTO}
        className="block touch-pan-y select-none"
        aria-hidden
        onPointerMove={alMover}
        onPointerDown={alMover}
        onPointerLeave={() => setActivo(null)}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line
              x1={MARGEN.izquierda}
              x2={ancho - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-meta)"
            >
              {v === 0 ? '0' : `$ ${compacto.format(v)}`}
            </text>
          </g>
        ))}
        {indicesX.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={ALTO - 8}
            textAnchor={
              dias.length <= 1
                ? 'middle'
                : k === 0
                  ? 'start'
                  : k === indicesX.length - 1
                    ? 'end'
                    : 'middle'
            }
            fontSize={11}
            fill="var(--color-meta)"
          >
            {diaCorto(dias[i]!.fecha)}
          </text>
        ))}
        {dias.length > 1 ? (
          <path
            d={linea}
            fill="none"
            stroke={activo !== null ? 'var(--color-ink)' : 'var(--color-meta)'}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {dia && activo !== null && (
          <g>
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={MARGEN.arriba}
              y2={ALTO - MARGEN.abajo}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
            />
            <circle
              cx={x(activo)}
              cy={y(dia.monto)}
              r={4}
              fill="var(--color-ink)"
              stroke="#fff"
              strokeWidth={2}
            />
          </g>
        )}
        {dias.length === 1 && !dia && (
          <circle cx={x(0)} cy={y(dias[0]!.monto)} r={4} fill="var(--color-meta)" />
        )}
      </svg>
      {dia && activo !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-2 py-1 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(x(activo), 70), Math.max(ancho - 70, 70)) }}
        >
          <span className="text-meta">{formatoFecha(dia.fecha)}</span>{' '}
          <span className="font-semibold tabular-nums text-ink">
            {formatoPesosEnteros(dia.monto)}
          </span>
        </div>
      )}
    </div>
  );
}
