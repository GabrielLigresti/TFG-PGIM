import { Link } from 'react-router';
import type { RestauranteComensal } from '@pgim/shared';
import { LayoutComensal } from '../../components/LayoutComensal';
import { EstadoCarga } from '../../components/ui';
import { useRecurso } from '../../lib/useRecurso';

// Entrada por lista: el comensal elige la sucursal (la otra entrada es el QR).
export function InicioComensalPage() {
  const { datos, cargando, error } = useRecurso<RestauranteComensal[]>('/comensal/sucursales');

  return (
    <LayoutComensal>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">¿Dónde estás?</h1>
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
                <li key={s.id}>
                  <Link
                    to={`/s/${s.id}/menu`}
                    className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <span className="block font-medium text-slate-800">{s.nombre}</span>
                    <span className="block text-sm text-slate-500">{s.direccion}</span>
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
