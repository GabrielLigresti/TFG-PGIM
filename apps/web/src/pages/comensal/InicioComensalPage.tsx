import { Link } from 'react-router';
import type { RestauranteComensal } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { EstadoCarga } from '../../components/ui';
import { useRecurso } from '../../lib/useRecurso';

// Entrada por lista: el comensal elige la sucursal (la otra entrada es el QR).
export function InicioComensalPage() {
  const { datos, cargando, error } = useRecurso<RestauranteComensal[]>('/comensal/sucursales');

  return (
    <LayoutComensal>
      <div className="mb-1">
        <TituloComensal>¿Dónde estás?</TituloComensal>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Elegí la sucursal para ver su menú, o escaneá el QR de la mesa.
      </p>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos?.length === 0 && (
        <p className="text-sm text-slate-500">Todavía no hay restaurantes disponibles.</p>
      )}
      <div className="space-y-5">
        {datos?.map((r) => (
          <section key={r.id}>
            <h2 className="mb-2 text-sm font-medium uppercase text-slate-500">{r.nombre}</h2>
            <ul className="space-y-2">
              {r.sucursales.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
                >
                  <Link
                    to={`/s/${s.id}/menu`}
                    className="min-w-0 flex-1 rounded-xl p-4 hover:bg-slate-50"
                  >
                    <span className="block font-medium text-slate-800">{s.nombre}</span>
                    <span className="block text-sm text-slate-500">{s.direccion}</span>
                  </Link>
                  <Link
                    to={`/s/${s.id}/reservar`}
                    className="mr-3 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reservar mesa
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </LayoutComensal>
  );
}
