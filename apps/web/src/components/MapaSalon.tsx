import { useRef, useState, type PointerEvent } from 'react';
import { LIENZO_SALON } from '@pgim/shared';

export interface MesaDibujo {
  id: string;
  numero: number;
  capacidad: number;
  posX: number;
  posY: number;
  estado?: 'LIBRE' | 'RESERVADA' | 'CHICA';
  inactiva?: boolean;
}

const RADIO = 4;

const COLOR: Record<NonNullable<MesaDibujo['estado']>, string> = {
  LIBRE: 'fill-emerald-100 stroke-emerald-600',
  RESERVADA: 'fill-slate-300 stroke-slate-500',
  CHICA: 'fill-slate-100 stroke-slate-400 [stroke-dasharray:1_0.6]',
};

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
}: {
  mesas: MesaDibujo[];
  seleccionadaId?: string | null;
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

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${LIENZO_SALON.ancho} ${LIENZO_SALON.alto}`}
      className="w-full touch-none select-none rounded-lg border border-slate-200"
      role="img"
      aria-label="Mapa del salón"
    >
      <rect width={LIENZO_SALON.ancho} height={LIENZO_SALON.alto} className="fill-slate-50" />
      {mesas.map((mesa) => {
        const enArrastre = arrastre?.id === mesa.id ? arrastre : null;
        const x = enArrastre?.x ?? mesa.posX;
        const y = enArrastre?.y ?? mesa.posY;
        const estado = mesa.estado ?? 'LIBRE';
        const elegible = Boolean(onElegir) && estado === 'LIBRE' && !mesa.inactiva;
        const seleccionada = mesa.id === seleccionadaId;
        return (
          <g
            key={mesa.id}
            opacity={mesa.inactiva ? 0.4 : 1}
            className={onMover ? 'cursor-grab' : elegible ? 'cursor-pointer' : undefined}
            onPointerDown={(e) => alApretar(e, mesa)}
            onPointerMove={alMover}
            onPointerUp={() => alSoltar(mesa)}
            onPointerCancel={() => setArrastre(null)}
            onClick={elegible ? () => onElegir?.(mesa.id) : undefined}
            role={elegible ? 'button' : undefined}
            aria-label={`Mesa ${mesa.numero}, ${mesa.capacidad} personas`}
            aria-pressed={elegible ? seleccionada : undefined}
          >
            {seleccionada && (
              <circle
                cx={x}
                cy={y}
                r={RADIO + 1.2}
                className="fill-none stroke-slate-800"
                strokeWidth={0.6}
              />
            )}
            <circle cx={x} cy={y} r={RADIO} strokeWidth={0.4} className={COLOR[estado]} />
            <text
              x={x}
              y={y + 0.2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={3}
              className="fill-slate-800 font-semibold"
            >
              {mesa.numero}
            </text>
            <text
              x={x}
              y={y + RADIO + 2.2}
              textAnchor="middle"
              fontSize={1.8}
              className="fill-slate-500"
            >
              {mesa.capacidad} p.
            </text>
          </g>
        );
      })}
    </svg>
  );
}
