import { CircleCheck, Star } from 'lucide-react';
import type { FidelidadComensal } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { BarraProgreso, conProgreso } from '../../components/PagoMesa';
import { EstadoCarga, Vacio } from '../../components/ui';
import { useRecurso } from '../../lib/useRecurso';

// "Mis puntos": lo que el comensal acumuló en cada restaurante y cuánto le
// falta para cada recompensa vigente.
export function MisPuntosPage() {
  const { datos, cargando, error } = useRecurso<FidelidadComensal[]>('/comensal/fidelidad');

  return (
    <LayoutComensal>
      <div className="mb-4">
        <TituloComensal>Mis puntos</TituloComensal>
      </div>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos?.length === 0 && (
        <Vacio
          icono={Star}
          titulo="Todavía no sumaste puntos"
          texto="Pagá tu próxima visita desde la app y empezá a acumular."
        />
      )}
      <div className="space-y-4">
        {datos?.map((cuenta) => {
          const recompensas = cuenta.recompensas.filter((r) => r.alcanzada || conProgreso(r));
          return (
            <section
              key={cuenta.restaurante.id}
              className="space-y-4 rounded-panel border border-line bg-surface p-4"
            >
              <h2 className="text-lg font-semibold text-ink">{cuenta.restaurante.nombre}</h2>
              <dl className="grid grid-cols-2 gap-3">
                {cuenta.programa && (
                  <div className="rounded-control bg-panel p-3">
                    <dt className="text-sm text-meta">Puntos</dt>
                    <dd className="text-2xl font-semibold tabular-nums text-ink">
                      {cuenta.puntos}
                    </dd>
                  </div>
                )}
                <div className="rounded-control bg-panel p-3">
                  <dt className="text-sm text-meta">Visitas</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-ink">{cuenta.visitas}</dd>
                </div>
              </dl>
              {recompensas.length > 0 && (
                <ul className="space-y-3">
                  {recompensas.map((r) => (
                    <li key={r.id} className="space-y-1">
                      {r.alcanzada ? (
                        <p className="flex items-center gap-2 text-sm">
                          <CircleCheck aria-hidden className="size-4 shrink-0 text-ok" />
                          <span className="min-w-0">
                            <span className="font-semibold text-ink">{r.nombre}</span>
                            <span className="text-meta"> · ¡Ya la podés usar al pagar!</span>
                          </span>
                        </p>
                      ) : (
                        <BarraProgreso nombre={r.nombre} progreso={r.progreso} />
                      )}
                      <p className="text-xs text-meta">{r.descripcion}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </LayoutComensal>
  );
}
