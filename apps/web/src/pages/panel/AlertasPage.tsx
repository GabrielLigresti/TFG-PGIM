import { useEffect, useState } from 'react';
import { BellOff, CircleAlert, TriangleAlert } from 'lucide-react';
import { EVENTOS_SOCKET, type AlertaPanel } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { useAvisos } from '../../components/AvisoEmergente';
import { Aviso, Boton, EncabezadoPagina, EstadoCarga, Vacio } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { formatoHora } from '../../lib/formato';
import { useEventoSocket } from '../../lib/socket';
import { useRecurso } from '../../lib/useRecurso';

const SEVERIDAD = {
  CRITICA: { icono: TriangleAlert, clase: 'text-bad', texto: 'Crítica' },
  ADVERTENCIA: { icono: CircleAlert, clase: 'text-warn', texto: 'Advertencia' },
  INFO: { icono: CircleAlert, clase: 'text-meta', texto: 'Aviso' },
} as const;

// Alertas de stock de la sucursal de trabajo: pedidos rechazados por falta de
// un insumo y platos que se pidieron sin receta. Llegan en vivo.
export function AlertasPage() {
  const { sesion } = useSesion();
  const { avisar } = useAvisos();
  const recurso = useRecurso<AlertaPanel[]>('/alertas');
  const [alertas, setAlertas] = useState<AlertaPanel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recurso.datos) setAlertas(recurso.datos);
  }, [recurso.datos]);

  useEventoSocket<AlertaPanel>(EVENTOS_SOCKET.alertaNueva, (alerta) => {
    setAlertas((lista) => (lista.some((a) => a.id === alerta.id) ? lista : [alerta, ...lista]));
    avisar(alerta.descripcion);
  });

  async function resolver(alerta: AlertaPanel) {
    setError(null);
    try {
      await api(`/alertas/${alerta.id}/resolver`, { method: 'POST' });
      setAlertas((lista) => lista.filter((a) => a.id !== alerta.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo marcar la alerta');
    }
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Alertas"
        descripcion={`Faltantes de stock y platos sin receta en ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}.`}
      />
      <EstadoCarga cargando={recurso.cargando && !recurso.datos} error={recurso.error} />
      <div className="mb-3">
        <Aviso>{error}</Aviso>
      </div>
      {recurso.datos && alertas.length === 0 && (
        <Vacio
          icono={BellOff}
          titulo="No hay alertas de stock."
          texto="Si un pedido no se puede confirmar por falta de un insumo, o se pide un plato sin receta, aparece acá."
        />
      )}
      {alertas.length > 0 && (
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {alertas.map((a) => {
            const { icono: Icono, clase, texto } = SEVERIDAD[a.severidad];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Icono aria-hidden className={`size-5 shrink-0 ${clase}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    <span className="sr-only">{texto}: </span>
                    {a.descripcion}
                  </p>
                  <p className="text-sm text-meta">
                    {a.tipo === 'STOCK_INSUFICIENTE'
                      ? 'Se rechazó un pedido por falta de stock'
                      : 'El pedido se confirmó sin descontar stock'}{' '}
                    · {formatoHora(a.creadaEn)} h
                  </p>
                </div>
                <Boton variante="tonal" onClick={() => void resolver(a)}>
                  Marcar resuelta
                </Boton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
