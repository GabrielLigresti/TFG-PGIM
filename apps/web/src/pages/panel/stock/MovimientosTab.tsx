import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  ETIQUETA_MOTIVO_MERMA,
  ETIQUETA_TIPO_MOVIMIENTO,
  MOTIVOS_MERMA,
  TIPOS_MOVIMIENTO,
  type ComponenteStock,
  type MotivoMerma,
  type MovimientoStockFila,
  type Pagina,
  type TipoMovimiento,
  type UnidadBase,
} from '@pgim/shared';
import { useSesion } from '../../../auth/SesionProvider';
import { Lista } from '../../../components/Lista';
import { Boton, EstadoCarga, Etiqueta, Vacio, claseInput } from '../../../components/ui';
import { formatoCantidadLegible, formatoDiaYHora, formatoPesos } from '../../../lib/formato';
import { useRecurso } from '../../../lib/useRecurso';
import { VerTanda } from './VerTanda';

const POR_UNIDAD: Record<UnidadBase, string> = { GRAMO: 'g', MILILITRO: 'ml', UNIDAD: 'unidad' };

// Historial de entradas y salidas de stock de la sucursal de trabajo.
export function MovimientosTab() {
  const { sesion } = useSesion();
  const sucursal = sesion?.sucursalActiva;
  const sucursalId = sucursal?.id ?? '';

  const [componenteId, setComponenteId] = useState('');
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('');
  const [motivoMerma, setMotivoMerma] = useState<MotivoMerma | ''>('');
  const [pagina, setPagina] = useState(1);
  const [tandaAbierta, setTandaAbierta] = useState<string | null>(null);

  const stock = useRecurso<ComponenteStock[]>(`/stock?sucursal=${sucursalId}`);
  const q = new URLSearchParams({ pagina: String(pagina), sucursal: sucursalId });
  if (componenteId) q.set('componenteId', componenteId);
  if (tipo) q.set('tipo', tipo);
  if (tipo === 'MERMA' && motivoMerma) q.set('motivoMerma', motivoMerma);
  const movimientos = useRecurso<Pagina<MovimientoStockFila>>(`/stock/movimientos?${q}`);

  const filtrado = componenteId !== '' || tipo !== '';
  const ultimaPagina = movimientos.datos
    ? Math.max(1, Math.ceil(movimientos.datos.total / movimientos.datos.porPagina))
    : 1;

  function filtrar(accion: () => void) {
    accion();
    setPagina(1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Componente"
          value={componenteId}
          onChange={(e) => filtrar(() => setComponenteId(e.target.value))}
          className={`${claseInput} sm:w-56`}
        >
          <option value="">Todos los componentes</option>
          {(stock.datos ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Tipo de movimiento"
          value={tipo}
          onChange={(e) =>
            filtrar(() => {
              setTipo(e.target.value as TipoMovimiento | '');
              setMotivoMerma('');
            })
          }
          className={`${claseInput} sm:w-56`}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_MOVIMIENTO[t]}
            </option>
          ))}
        </select>
        {tipo === 'MERMA' && (
          <select
            aria-label="Motivo de la merma"
            value={motivoMerma}
            onChange={(e) => filtrar(() => setMotivoMerma(e.target.value as MotivoMerma | ''))}
            className={`${claseInput} sm:w-56`}
          >
            <option value="">Todos los motivos</option>
            {MOTIVOS_MERMA.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MOTIVO_MERMA[m]}
              </option>
            ))}
          </select>
        )}
      </div>

      <EstadoCarga
        cargando={movimientos.cargando && !movimientos.datos}
        error={movimientos.error}
      />
      {movimientos.datos && (
        <>
          <Lista
            filas={movimientos.datos.filas}
            clave={(m) => m.id}
            vacio={
              <Vacio
                icono={ArrowLeftRight}
                titulo={
                  filtrado
                    ? 'No hay movimientos con ese filtro'
                    : `Todavía no hay movimientos en ${sucursal?.nombre ?? 'la sucursal'}`
                }
              />
            }
            columnas={[
              {
                titulo: 'Fecha',
                valor: (m) => formatoDiaYHora(m.fecha),
                className: 'whitespace-nowrap',
              },
              { titulo: 'Componente', valor: (m) => m.componente.nombre },
              {
                titulo: 'Tipo',
                valor: (m) => (
                  <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 md:justify-start">
                    <Etiqueta>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}</Etiqueta>
                    {m.tandaId && (
                      <button
                        type="button"
                        onClick={() => setTandaAbierta(m.tandaId)}
                        className="text-sm font-medium text-accent-ink underline underline-offset-2"
                      >
                        Ver la tanda
                      </button>
                    )}
                  </span>
                ),
              },
              {
                titulo: 'Cantidad',
                valor: (m) => (
                  <span className={m.cantidad < 0 ? 'text-meta' : 'text-ink'}>
                    {m.cantidad < 0 ? '−' : '+'}
                    {formatoCantidadLegible(Math.abs(m.cantidad), m.componente.unidadBase)}
                  </span>
                ),
                className: 'whitespace-nowrap tabular-nums',
              },
              {
                titulo: 'Costo unitario',
                valor: (m) =>
                  `${formatoPesos(m.costoUnitario)} por ${POR_UNIDAD[m.componente.unidadBase]}`,
                className: 'whitespace-nowrap tabular-nums',
              },
              {
                titulo: 'Motivo',
                valor: (m) =>
                  [m.motivoMerma ? ETIQUETA_MOTIVO_MERMA[m.motivoMerma] : null, m.motivo]
                    .filter(Boolean)
                    .join(' · ') || '—',
              },
              { titulo: 'Registró', valor: (m) => m.empleado ?? '—' },
            ]}
          />
          {ultimaPagina > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm text-meta">
              <Boton
                variante="secundario"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anteriores
              </Boton>
              <span>
                Página {movimientos.datos.pagina} de {ultimaPagina}
              </span>
              <Boton
                variante="secundario"
                disabled={pagina >= ultimaPagina}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguientes
              </Boton>
            </div>
          )}
        </>
      )}

      {tandaAbierta && (
        <VerTanda
          id={tandaAbierta}
          sucursal={sucursalId}
          componentes={stock.datos ?? []}
          onCerrar={() => setTandaAbierta(null)}
        />
      )}
    </div>
  );
}
