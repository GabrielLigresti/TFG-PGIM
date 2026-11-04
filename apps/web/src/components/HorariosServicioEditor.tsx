import { FRANJAS, type Franja, type Sucursal } from '@pgim/shared';
import { Casilla, claseInput } from './ui';

export const NOMBRE_FRANJA: Record<Franja, string> = { ALMUERZO: 'Almuerzo', CENA: 'Cena' };

const HORARIO_POR_DEFECTO: Record<Franja, { horaInicio: string; horaFin: string }> = {
  ALMUERZO: { horaInicio: '12:00', horaFin: '16:00' },
  CENA: { horaInicio: '20:00', horaFin: '00:00' },
};

export interface ServicioEditable {
  franja: Franja;
  habilitada: boolean;
  horaInicio: string;
  horaFin: string;
}

// Una sucursal nueva arranca con las dos franjas habilitadas; una existente, con las suyas.
export function servicioInicial(sucursal?: Sucursal | null): ServicioEditable[] {
  return FRANJAS.map((franja) => {
    const actual = sucursal?.horariosServicio.find((h) => h.franja === franja);
    return {
      franja,
      habilitada: sucursal ? Boolean(actual) : true,
      ...(actual ?? HORARIO_POR_DEFECTO[franja]),
    };
  });
}

export function servicioAEnviar(servicio: ServicioEditable[]) {
  return servicio
    .filter((h) => h.habilitada)
    .map(({ franja, horaInicio, horaFin }) => ({ franja, horaInicio, horaFin }));
}

// Editor de las franjas de almuerzo y cena: casilla, hora de inicio y de fin.
export function HorariosServicioEditor({
  servicio,
  onChange,
}: {
  servicio: ServicioEditable[];
  onChange(servicio: ServicioEditable[]): void;
}) {
  function cambiar(franja: Franja, cambios: Partial<ServicioEditable>) {
    onChange(servicio.map((h) => (h.franja === franja ? { ...h, ...cambios } : h)));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">Horarios de servicio</legend>
      {servicio.map((h) => (
        <div key={h.franja} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2">
          <Casilla
            etiqueta={NOMBRE_FRANJA[h.franja]}
            checked={h.habilitada}
            onChange={(habilitada) => cambiar(h.franja, { habilitada })}
          />
          <input
            type="time"
            aria-label={`Inicio de ${NOMBRE_FRANJA[h.franja]}`}
            disabled={!h.habilitada}
            value={h.horaInicio}
            onChange={(e) => cambiar(h.franja, { horaInicio: e.target.value })}
            className={claseInput}
          />
          <input
            type="time"
            aria-label={`Fin de ${NOMBRE_FRANJA[h.franja]}`}
            disabled={!h.habilitada}
            value={h.horaFin}
            onChange={(e) => cambiar(h.franja, { horaFin: e.target.value })}
            className={claseInput}
          />
        </div>
      ))}
    </fieldset>
  );
}
