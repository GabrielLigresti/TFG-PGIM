import { useState } from 'react';
import {
  ETIQUETA_MOTIVO_MERMA,
  errorDePeriodo,
  hoyArgentina,
  resolverPeriodo,
  type Metricas,
} from '@pgim/shared';
import { Campo, EncabezadoPagina, EstadoCarga, Kpi, Panel, claseInput } from '../../components/ui';
import { formatoFecha, formatoLista, formatoPesos, formatoPesosEnteros } from '../../lib/formato';
import { useRecurso } from '../../lib/useRecurso';
import { NOMBRE_FRANJA } from './apertura/semana';
import { BarrasHorizontales } from './metricas/BarrasHorizontales';
import { completarDias } from './metricas/diasPeriodo';
import { GraficoVentas } from './metricas/GraficoVentas';
import { VerComoTabla } from './metricas/VerComoTabla';

const SIN_DATO = 'Sin dato';
const celda = 'px-2 py-2 text-right tabular-nums';
const encabezado = 'px-2 py-2 text-right text-xs font-semibold text-meta';

const porcentaje = (valor: number | null) =>
  valor === null ? SIN_DATO : `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
const unidades = (n: number) => n.toLocaleString('es-AR');

function VacioMetrica({ texto }: { texto: string }) {
  return <p className="py-6 text-center text-sm text-meta">{texto}</p>;
}

// Métricas por sucursal y período: ventas, platos, margen, merma, ocupación y proyección.
export function MetricasPage() {
  const inicial = resolverPeriodo({}, hoyArgentina(new Date()));
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [sucursalId, setSucursalId] = useState('');

  const errorPeriodo = !desde || !hasta ? 'Elegí las dos fechas' : errorDePeriodo(desde, hasta);
  const q = new URLSearchParams({ desde, hasta });
  if (sucursalId) q.set('sucursalId', sucursalId);
  const recurso = useRecurso<Metricas>(errorPeriodo ? null : `/metricas?${q}`);
  const m = recurso.datos;
  const { etiquetaTotal, sucursales } = m?.alcance ?? { etiquetaTotal: null, sucursales: [] };

  return (
    <section>
      <EncabezadoPagina
        titulo="Métricas"
        descripcion="Ventas, platos, merma y ocupación de tus sucursales."
      />
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Campo etiqueta="Desde" className="w-full sm:w-44">
          <input
            type="date"
            className={claseInput}
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Hasta" error={errorPeriodo ?? undefined} className="w-full sm:w-44">
          <input
            type="date"
            className={claseInput}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </Campo>
        {etiquetaTotal && (
          <Campo etiqueta="Sucursal" className="w-full sm:w-56">
            <select
              className={claseInput}
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
            >
              <option value="">{etiquetaTotal}</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      <EstadoCarga cargando={recurso.cargando && !m} error={recurso.error} />
      {m && <Contenido m={m} actualizando={recurso.cargando} />}
    </section>
  );
}

function Contenido({ m, actualizando }: { m: Metricas; actualizando: boolean }) {
  const dias = completarDias(m.periodo.desde, m.periodo.hasta, m.ventas.porDia);
  const hayVentas = m.ventas.total > 0;
  const mejorDia = dias.reduce((a, d) => (d.monto > a.monto ? d : a), dias[0]!);

  const platos = [...m.platosMasPedidos].sort((a, b) => b.unidades - a.unidades);
  const motivos = [...m.merma.porMotivo].sort((a, b) => b.valor - a.valor);
  const ranking = [...m.margenPorPlato].sort(
    (a, b) => (b.margenTotal ?? -Infinity) - (a.margenTotal ?? -Infinity),
  );
  const { excluidas, sinPronostico } = m.proyeccion;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${actualizando ? 'opacity-70' : ''}`}
      aria-busy={actualizando}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          etiqueta="Ventas"
          valor={formatoPesosEnteros(m.ventas.total)}
          detalle={`Del ${formatoFecha(m.periodo.desde)} al ${formatoFecha(m.periodo.hasta)}`}
        />
        <Kpi
          etiqueta="Ocupación"
          valor={porcentaje(m.ocupacion.porcentaje)}
          detalle={
            m.ocupacion.porFranja
              .map((f) => `${NOMBRE_FRANJA[f.franja]} ${porcentaje(f.porcentaje)}`)
              .join(' · ') || undefined
          }
        />
        <Kpi
          etiqueta="Merma"
          valor={formatoPesosEnteros(m.merma.total)}
          detalle="Valor de lo descartado"
        />
        <Kpi
          etiqueta="Proyección de la semana"
          valor={formatoPesosEnteros(m.proyeccion.total)}
          detalle={`Semana del ${formatoFecha(m.proyeccion.semanaDesde)}`}
        />
      </div>
      {(excluidas.length > 0 || sinPronostico.length > 0) && (
        <p className="-mt-1 text-sm text-meta">
          La proyección no incluye
          {excluidas.length > 0 &&
            ` ${formatoLista(excluidas.map((e) => e.sucursal))}: no tiene historial suficiente (${formatoLista(excluidas.map((e) => `${e.semanas} de ${e.minimo} semanas`))})`}
          {excluidas.length > 0 && sinPronostico.length > 0 && ' ni'}
          {sinPronostico.length > 0 &&
            ` ${formatoLista(sinPronostico)}: todavía no tiene pronóstico`}
          .
        </p>
      )}

      <Panel titulo="Ventas por día" className="min-w-0">
        {hayVentas ? (
          <VerComoTabla
            resumen={`Ventas por día del ${formatoFecha(m.periodo.desde)} al ${formatoFecha(m.periodo.hasta)}: total ${formatoPesosEnteros(m.ventas.total)}, el mejor día fue el ${formatoFecha(mejorDia.fecha)} con ${formatoPesosEnteros(mejorDia.monto)}.`}
            grafico={<GraficoVentas dias={dias} />}
            tabla={
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className={`${encabezado} !text-left`}>Día</th>
                      <th className={encabezado}>Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dias.map((d) => (
                      <tr key={d.fecha}>
                        <td className="px-2 py-1.5 tabular-nums">{formatoFecha(d.fecha)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatoPesosEnteros(d.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        ) : (
          <VacioMetrica texto="No hubo ventas en este período." />
        )}
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Panel titulo="Platos más pedidos" className="min-w-0">
          {platos.length > 0 ? (
            <VerComoTabla
              resumen={`Platos más pedidos: ${platos.map((p) => `${p.nombre}, ${unidades(p.unidades)} unidades`).join('; ')}.`}
              grafico={
                <BarrasHorizontales
                  barras={platos.map((p) => ({
                    id: p.itemMenuId,
                    etiqueta: p.nombre,
                    valor: p.unidades,
                    texto: unidades(p.unidades),
                    aviso: `${p.nombre}: ${unidades(p.unidades)} unidades`,
                  }))}
                />
              }
              tabla={
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={`${encabezado} !text-left`}>Plato</th>
                      <th className={encabezado}>Unidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {platos.map((p) => (
                      <tr key={p.itemMenuId}>
                        <td className="px-2 py-1.5">{p.nombre}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {unidades(p.unidades)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          ) : (
            <VacioMetrica texto="No se pidieron platos en este período." />
          )}
        </Panel>

        <Panel titulo="Merma por motivo" className="min-w-0">
          {motivos.length > 0 ? (
            <VerComoTabla
              resumen={`Merma por motivo, total ${formatoPesosEnteros(m.merma.total)}: ${motivos.map((x) => `${ETIQUETA_MOTIVO_MERMA[x.motivo]}, ${formatoPesosEnteros(x.valor)}`).join('; ')}.`}
              grafico={
                <BarrasHorizontales
                  barras={motivos.map((x) => ({
                    id: x.motivo,
                    etiqueta: ETIQUETA_MOTIVO_MERMA[x.motivo],
                    valor: x.valor,
                    texto: formatoPesosEnteros(x.valor),
                    aviso: `${ETIQUETA_MOTIVO_MERMA[x.motivo]}: ${formatoPesos(x.valor)}`,
                  }))}
                />
              }
              tabla={
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={`${encabezado} !text-left`}>Motivo</th>
                      <th className={encabezado}>Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {motivos.map((x) => (
                      <tr key={x.motivo}>
                        <td className="px-2 py-1.5">{ETIQUETA_MOTIVO_MERMA[x.motivo]}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatoPesos(x.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          ) : (
            <VacioMetrica texto="No se registró merma en este período." />
          )}
        </Panel>
      </div>

      <Panel titulo="Ranking por margen" className="min-w-0">
        <p className="-mt-2 mb-3 text-sm text-meta">
          Según el costo actual de cada receta, no el de cuando se vendió.
        </p>
        {ranking.length > 0 ? (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-line">
                  <th className={`${encabezado} !text-left`}>Plato</th>
                  <th className={encabezado}>Unidades</th>
                  <th className={encabezado}>Precio promedio</th>
                  <th className={encabezado}>Costo</th>
                  <th className={encabezado}>Margen por unidad</th>
                  <th className={encabezado}>Margen total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranking.map((p) => (
                  <tr key={p.itemMenuId}>
                    <td className="px-2 py-2 text-ink">{p.nombre}</td>
                    <td className={celda}>{unidades(p.unidades)}</td>
                    <td className={celda}>{formatoPesos(p.precioPromedio)}</td>
                    <td className={celda}>{p.costo === null ? SIN_DATO : formatoPesos(p.costo)}</td>
                    <td className={celda}>
                      {p.margenUnitario === null ? SIN_DATO : formatoPesos(p.margenUnitario)}
                    </td>
                    <td className={`${celda} font-medium text-ink`}>
                      {p.margenTotal === null ? SIN_DATO : formatoPesosEnteros(p.margenTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {ranking.map((p) => (
                <li key={p.itemMenuId} className="grid gap-0.5 py-2.5">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink">{p.nombre}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">
                      {p.margenTotal === null ? SIN_DATO : formatoPesosEnteros(p.margenTotal)}
                    </span>
                  </p>
                  <p className="text-xs tabular-nums text-meta">
                    {unidades(p.unidades)} u. · precio {formatoPesos(p.precioPromedio)} · costo{' '}
                    {p.costo === null ? SIN_DATO.toLowerCase() : formatoPesos(p.costo)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <VacioMetrica texto="No hay platos vendidos para calcular el margen." />
        )}
      </Panel>
    </div>
  );
}
