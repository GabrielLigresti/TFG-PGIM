import type { TandaDetalle, UnidadBase } from '@pgim/shared';
import { Estado, Kpi } from '../../../components/ui';
import { formatoCantidad, formatoHora, formatoPesos } from '../../../lib/formato';
import {
  conPerdidaEnPesos,
  costoPorUnidad,
  formatoDiferencia,
  formatoRendimiento,
  marcaTanda,
  rendimientoPorcentaje,
} from './tanda';

// Lo que se ve de una tanda ya registrada: en el resultado y en el detalle de la lista.
export function DetalleTanda({
  tanda,
  unidadBase,
}: {
  tanda: TandaDetalle;
  unidadBase?: UnidadBase;
}) {
  const { desvio } = tanda;
  const costo = costoPorUnidad(tanda.costoUnitario, unidadBase);
  const cantidad = (v: number) => formatoCantidad(v, unidadBase);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{tanda.intermedio.nombre}</p>
          <p className="text-sm tabular-nums text-meta">
            Esperado {cantidad(tanda.esperada)} · Obtenido {cantidad(tanda.obtenida)}
          </p>
        </div>
        <Estado entidad="tanda" valor={marcaTanda(desvio)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi
          etiqueta="Rendimiento"
          valor={formatoRendimiento(desvio)}
          tono={rendimientoPorcentaje(desvio) < 95 ? 'warn' : 'neutro'}
        />
        <Kpi
          etiqueta="Pérdida"
          valor={formatoPesos(desvio.total)}
          detalle={`por rendimiento ${formatoPesos(desvio.faltanteRendimiento)} · por uso de más ${formatoPesos(desvio.usoDeMas)}`}
          tono={conPerdidaEnPesos(desvio) ? 'warn' : 'neutro'}
        />
        <Kpi etiqueta={costo.etiqueta} valor={formatoPesos(costo.valor)} />
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line">
        {tanda.consumos.map((c) => {
          const dif = formatoDiferencia(c.diferencia, c.componente.unidadBase);
          return (
            <li
              key={c.componente.id}
              className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto]"
            >
              <span className="font-medium text-ink">{c.componente.nombre}</span>
              <span className="tabular-nums text-meta">
                Receta {formatoCantidad(c.teorica, c.componente.unidadBase)}
              </span>
              <span className="tabular-nums text-text">
                Usado {formatoCantidad(c.usada, c.componente.unidadBase)}
                {dif && <span className="ml-1 text-meta">({dif})</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-meta">
        Registrada a las {formatoHora(tanda.fecha)}
        {tanda.empleado && ` por ${tanda.empleado}`}
        {tanda.observacion && ` · ${tanda.observacion}`}
      </p>
    </div>
  );
}
