import { useRef, useState, type PointerEvent } from 'react';
import { LIENZO_SALON } from '@pgim/shared';

export interface MesaDibujo {
  id: string;
  numero: number;
  capacidad: number;
  posX: number;
  posY: number;
  estado?: EstadoMesaDibujo;
  inactiva?: boolean;
}

export type EstadoMesaDibujo = 'LIBRE' | 'RESERVADA' | 'OCUPADA' | 'INASISTENCIA' | 'CHICA';

const RADIO = 4;

// Colores de mesa según la tabla de estados del sistema visual.
const COLOR: Record<EstadoMesaDibujo, { mesa: string; texto: string }> = {
  LIBRE: { mesa: 'fill-ok-soft stroke-ok', texto: 'fill-ok' },
  RESERVADA: { mesa: 'fill-surface stroke-meta', texto: 'fill-ink' },
  OCUPADA: { mesa: 'fill-accent stroke-accent', texto: 'fill-white' },
  INASISTENCIA: { mesa: 'fill-surface stroke-warn', texto: 'fill-warn' },
  CHICA: { mesa: 'fill-surface stroke-line-strong [stroke-dasharray:1_0.6]', texto: 'fill-meta' },
};

const NOMBRE: Record<EstadoMesaDibujo, string> = {
  LIBRE: 'Libre',
  RESERVADA: 'Reservada',
  OCUPADA: 'Ocupada',
  INASISTENCIA: 'Inasistencia',
  CHICA: 'Chica para el grupo',
};

// Referencias de color del plano; se muestran solo los estados que la pantalla usa.
export function LeyendaSalon({
  estados,
  inactiva,
}: {
  estados: EstadoMesaDibujo[];
  inactiva?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-meta">
      {estados.map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <svg viewBox="0 0 10 10" className="size-3.5" aria-hidden>
            <circle cx={5} cy={5} r={4} strokeWidth={1.2} className={COLOR[e].mesa} />
          </svg>
          {NOMBRE[e]}
        </li>
      ))}
      {inactiva && (
        <li className="flex items-center gap-1.5">
          <svg viewBox="0 0 10 10" className="size-3.5" aria-hidden>
            <circle
              cx={5}
              cy={5}
              r={4}
              strokeWidth={1.2}
              fill="url(#rayado-leyenda)"
              className="stroke-line-strong"
            />
            <defs>
              <pattern
                id="rayado-leyenda"
                width="2"
                height="2"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="2" height="2" className="fill-panel" />
                <rect width="0.8" height="2" className="fill-line-strong" />
              </pattern>
            </defs>
          </svg>
          Dada de baja
        </li>
      )}
    </ul>
  );
}

function limitar(valor: number, max: number) {
  return Math.min(Math.max(valor, RADIO), max - RADIO);
}

// Plano del salón sobre el lienzo lógico de 100 × 60 (CU-14). Con onMover las
// mesas se arrastran con mouse o con el dedo y la posición se informa al
// soltar; con onElegir se pueden tocar las mesas libres (CU-03).
export function MapaSalon({
  mesas,
  seleccionadaId,
  onElegir,
  onMover,
  horaReservada,
}: {
  mesas: MesaDibujo[];
  seleccionadaId?: string | null;
  // Hora que se escribe dentro de las mesas reservadas.
  horaReservada?(mesa: MesaDibujo): string | undefined;
  onElegir?(id: string): void;
  onMover?(id: string, posX: number, posY: number): void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number } | null>(null);

  function aLienzo(e: PointerEvent): { x: number; y: number } | null {
    const matriz = svg.current?.getScreenCTM();
    if (!matriz) return null;
    const punto = new DOMPoint(e.clientX, e.clientY).matrixTransform(matriz.inverse());
    return {
      x: Math.round(limitar(punto.x, LIENZO_SALON.ancho) * 10) / 10,
      y: Math.round(limitar(punto.y, LIENZO_SALON.alto) * 10) / 10,
    };
  }

  function alApretar(e: PointerEvent<SVGGElement>, mesa: MesaDibujo) {
    if (!onMover) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastre({ id: mesa.id, x: mesa.posX, y: mesa.posY });
  }

  function alMover(e: PointerEvent<SVGGElement>) {
    if (!arrastre) return;
    const punto = aLienzo(e);
    if (punto) setArrastre({ ...arrastre, ...punto });
  }

  function alSoltar(mesa: MesaDibujo) {
    if (!arrastre) return;
    setArrastre(null);
    if (arrastre.x !== mesa.posX || arrastre.y !== mesa.posY) {
      onMover?.(mesa.id, arrastre.x, arrastre.y);
    }
  }

  // En el celular el plano no se achica más que esto: así el texto de las
  // mesas no baja de 12 px y el plano se desplaza de costado.
  return (
    <div className="overflow-x-auto rounded-panel border border-line">
      <svg
        ref={svg}
        viewBox={`0 0 ${LIENZO_SALON.ancho} ${LIENZO_SALON.alto}`}
        className={`block w-full min-w-[500px] select-none ${onMover ? 'touch-none' : ''}`}
        role="img"
        aria-label="Mapa del salón"
      >
        <defs>
          <pattern
            id="rayado-mesa"
            width="1.6"
            height="1.6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="1.6" height="1.6" className="fill-panel" />
            <rect width="0.6" height="1.6" className="fill-line-strong" />
          </pattern>
        </defs>
        <rect width={LIENZO_SALON.ancho} height={LIENZO_SALON.alto} className="fill-surface" />
        {mesas.map((mesa) => {
          const enArrastre = arrastre?.id === mesa.id ? arrastre : null;
          const x = enArrastre?.x ?? mesa.posX;
          const y = enArrastre?.y ?? mesa.posY;
          const estado = mesa.estado ?? 'LIBRE';
          const elegible = Boolean(onElegir) && estado === 'LIBRE' && !mesa.inactiva;
          const seleccionada = mesa.id === seleccionadaId;
          const hora = estado === 'RESERVADA' ? horaReservada?.(mesa) : undefined;
          const colores = mesa.inactiva
            ? { mesa: 'stroke-line-strong', texto: 'fill-meta' }
            : COLOR[estado];
          return (
            <g
              key={mesa.id}
              className={onMover ? 'cursor-grab' : elegible ? 'cursor-pointer' : undefined}
              onPointerDown={(e) => alApretar(e, mesa)}
              onPointerMove={alMover}
              onPointerUp={() => alSoltar(mesa)}
              onPointerCancel={() => setArrastre(null)}
              onClick={elegible ? () => onElegir?.(mesa.id) : undefined}
              onKeyDown={
                elegible
                  ? (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      onElegir?.(mesa.id);
                    }
                  : undefined
              }
              tabIndex={elegible ? 0 : undefined}
              role={elegible ? 'button' : undefined}
              aria-label={`Mesa ${mesa.numero}, ${mesa.capacidad} personas${
                mesa.inactiva ? ', dada de baja' : `, ${NOMBRE[estado].toLowerCase()}`
              }`}
              aria-pressed={elegible ? seleccionada : undefined}
            >
              {/* La selección se marca con un contorno oscuro separado, distinto del acento de ocupada. */}
              {seleccionada && (
                <circle
                  cx={x}
                  cy={y}
                  r={RADIO + 1.3}
                  className="fill-none stroke-ink"
                  strokeWidth={0.6}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={RADIO}
                strokeWidth={0.4}
                className={colores.mesa}
                fill={mesa.inactiva ? 'url(#rayado-mesa)' : undefined}
              />
              <text
                x={x}
                y={hora ? y - 0.6 : y + 0.2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={3.2}
                className={`font-semibold ${colores.texto}`}
              >
                {mesa.numero}
              </text>
              {hora && (
                <text
                  x={x}
                  y={y + 2.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={2.4}
                  className="fill-meta"
                >
                  {hora}
                </text>
              )}
              <text
                x={x}
                y={y + RADIO + 2.6}
                textAnchor="middle"
                fontSize={2.4}
                className="fill-meta"
              >
                {mesa.capacidad} p.
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
