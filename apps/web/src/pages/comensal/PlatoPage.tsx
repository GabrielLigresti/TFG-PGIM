import { useParams } from 'react-router';
import type { DetallePlato } from '@pgim/shared';
import { LayoutComensal } from '../../components/LayoutComensal';
import { EstadoCarga } from '../../components/ui';
import { formatoCantidad, formatoPesos } from '../../lib/formato';
import { useRecurso } from '../../lib/useRecurso';

// Detalle del plato (CU-10). "Ver en RA" aparece solo si el plato tiene modelo (E1).
export function PlatoPage() {
  const { sucursalId, id } = useParams();
  const { datos, cargando, error } = useRecurso<DetallePlato>(
    `/comensal/sucursales/${sucursalId}/platos/${id}`,
  );
  const plato = datos?.plato;

  return (
    <LayoutComensal volver={{ a: `/s/${sucursalId}/menu`, texto: 'Menú' }}>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {plato && (
        <article className="space-y-4">
          {plato.fotoUrl && (
            <img
              src={plato.fotoUrl}
              alt={plato.nombre}
              className="aspect-video w-full rounded-xl object-cover"
            />
          )}
          <div>
            <p className="text-sm text-slate-500">{plato.categoria.nombre}</p>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-semibold text-slate-800">{plato.nombre}</h1>
              <span className="text-lg text-slate-800">{formatoPesos(plato.precio)}</span>
            </div>
            {plato.descripcion && <p className="mt-1 text-slate-600">{plato.descripcion}</p>}
            {plato.modeloRa && (
              <p className="mt-1 text-sm text-slate-500">
                Porción: {formatoCantidad(plato.modeloRa.porcionGramos, 'GRAMO')}
              </p>
            )}
          </div>
        </article>
      )}
    </LayoutComensal>
  );
}
