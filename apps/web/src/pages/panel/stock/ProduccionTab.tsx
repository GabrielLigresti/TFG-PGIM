import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import type { ComponenteStock, Pagina, TandaDetalle, TandaResumen } from '@pgim/shared';
import { useSesion } from '../../../auth/SesionProvider';
import { Lista } from '../../../components/Lista';
import { Boton, EstadoCarga, Estado, Modal, Vacio, claseInput } from '../../../components/ui';
import { formatoCantidad, formatoDiaYHora, formatoPesos } from '../../../lib/formato';
import { useRecurso } from '../../../lib/useRecurso';
import { DetalleTanda } from './DetalleTanda';
import { FormTanda } from './FormTanda';
import { formatoRendimiento, marcaTanda } from './tanda';

// Preparaciones que se producen por tandas: historial y registro de una nueva.
export function ProduccionTab() {
  const { sesion, tienePermiso } = useSesion();
  const puedeRegistrar = tienePermiso('stock.registrar');
  const sucursal = sesion?.sucursalActiva?.id ?? '';

  const [registrando, setRegistrando] = useState(false);
  const [intermedioId, setIntermedioId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<string | null>(null);

  const stock = useRecurso<ComponenteStock[]>(`/stock?sucursal=${sucursal}`);
  const q = new URLSearchParams({ pagina: String(pagina), sucursal });
  if (intermedioId) q.set('intermedioId', intermedioId);
  const tandas = useRecurso<Pagina<TandaResumen>>(`/stock/produccion?${q}`);
  const detalle = useRecurso<TandaDetalle>(
    abierta ? `/stock/produccion/${abierta}?sucursal=${sucursal}` : null,
  );

  const componentes = (stock.datos ?? []).filter((c) => c.activo);
  const preparaciones = componentes.filter((c) => c.tipo === 'INTERMEDIO');
  const unidadDe = (id: string) => stock.datos?.find((c) => c.id === id)?.unidadBase;

  if (registrando) {
    return (
      <FormTanda
        preparaciones={preparaciones}
        componentes={componentes}
        onVolver={() => setRegistrando(false)}
        onRegistrada={() => {
          stock.recargar();
          tandas.recargar();
        }}
      />
    );
  }

  const registrar = puedeRegistrar && (
    <Boton onClick={() => setRegistrando(true)}>Registrar tanda</Boton>
  );
  const ultimaPagina = tandas.datos
    ? Math.max(1, Math.ceil(tandas.datos.total / tandas.datos.porPagina))
    : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Preparación"
          value={intermedioId}
          onChange={(e) => {
            setIntermedioId(e.target.value);
            setPagina(1);
          }}
          className={`${claseInput} sm:w-64`}
        >
          <option value="">Todas las preparaciones</option>
          {preparaciones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        {registrar}
      </div>

      <EstadoCarga cargando={tandas.cargando && !tandas.datos} error={tandas.error} />
      {tandas.datos && (
        <>
          <Lista
            filas={tandas.datos.filas}
            clave={(t) => t.id}
            onSeleccionar={(t) => setAbierta(t.id)}
            etiquetaSeleccion={(t) => `Ver la tanda de ${t.intermedio.nombre}`}
            vacio={
              <Vacio
                icono={ChefHat}
                titulo="Todavía no se registró ninguna tanda"
                texto={
                  puedeRegistrar
                    ? 'Cuando prepares una tanda, registrala acá para descontar los insumos y sumar lo obtenido.'
                    : undefined
                }
                accion={registrar || undefined}
              />
            }
            columnas={[
              {
                titulo: 'Fecha',
                valor: (t) => formatoDiaYHora(t.fecha),
                className: 'whitespace-nowrap',
              },
              { titulo: 'Preparación', valor: (t) => t.intermedio.nombre },
              {
                titulo: 'Esperado',
                valor: (t) => formatoCantidad(t.esperada, unidadDe(t.intermedio.id)),
                className: 'tabular-nums',
              },
              {
                titulo: 'Obtenido',
                valor: (t) => formatoCantidad(t.obtenida, unidadDe(t.intermedio.id)),
                className: 'tabular-nums',
              },
              {
                titulo: 'Rendimiento',
                valor: (t) => formatoRendimiento(t.desvio),
                className: 'tabular-nums',
              },
              {
                titulo: 'Pérdida',
                valor: (t) => formatoPesos(t.desvio.total),
                className: 'tabular-nums',
              },
              {
                titulo: 'Estado',
                valor: (t) => <Estado entidad="tanda" valor={marcaTanda(t.desvio)} />,
              },
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
                Página {tandas.datos.pagina} de {ultimaPagina}
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

      {abierta && (
        <Modal titulo="Detalle de la tanda" onCerrar={() => setAbierta(null)} ancho="max-w-2xl">
          <EstadoCarga cargando={detalle.cargando && !detalle.datos} error={detalle.error} />
          {detalle.datos && detalle.datos.id === abierta && (
            <DetalleTanda
              tanda={detalle.datos}
              unidadBase={unidadDe(detalle.datos.intermedio.id)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
