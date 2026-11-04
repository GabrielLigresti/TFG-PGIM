import { CircleCheck, CircleAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AlertaSimulador, PlanificacionSemana, TipoAlertaSimulador } from '@pgim/shared';
import { Panel } from '../../../components/ui';
import { formatoHora } from '../../../lib/formato';

const GRUPOS: { tipo: TipoAlertaSimulador; titulo: string }[] = [
  { tipo: 'FALTANTE_PERSONAL', titulo: 'Personal' },
  { tipo: 'FALTANTE_STOCK_PREVISTO', titulo: 'Stock' },
  { tipo: 'CAPACIDAD_MESAS', titulo: 'Mesas' },
];

const diaDelAviso = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const ORDEN_FRANJA = { ALMUERZO: 0, CENA: 1 };

function porFecha(a: AlertaSimulador, b: AlertaSimulador) {
  return (
    (a.fecha ?? '').localeCompare(b.fecha ?? '') ||
    (a.franja ? ORDEN_FRANJA[a.franja] : 0) - (b.franja ? ORDEN_FRANJA[b.franja] : 0)
  );
}

const ESTILO: Record<
  'CRITICA' | 'ADVERTENCIA' | 'INFO',
  { tono: string; icono: LucideIcon; texto: string }
> = {
  CRITICA: { tono: 'text-bad', icono: CircleAlert, texto: 'Crítica' },
  ADVERTENCIA: { tono: 'text-warn', icono: TriangleAlert, texto: 'Advertencia' },
  INFO: { tono: 'text-meta', icono: CircleAlert, texto: 'Aviso' },
};

function StockVerificado({ generadaEn }: { generadaEn: string }) {
  const dia = diaDelAviso.format(new Date(generadaEn)).replace(',', '');
  return (
    <p className="mt-1 text-xs text-meta">
      Stock verificado el {dia} a las {formatoHora(generadaEn)}
    </p>
  );
}

// Lo que el gerente tiene que resolver antes de confirmar, agrupado por tipo.
export function AlertasSemana({ planificacion }: { planificacion: PlanificacionSemana }) {
  const { alertas, generadaEn } = planificacion;

  if (alertas.length === 0) {
    return (
      <div>
        <p className="flex items-center gap-2 rounded-panel border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          No hay faltantes previstos para la semana
        </p>
        <StockVerificado generadaEn={generadaEn} />
      </div>
    );
  }

  return (
    <Panel
      titulo={
        planificacion.estado === 'CONFIRMADA'
          ? 'Alertas de la semana'
          : 'Para revisar antes de confirmar'
      }
    >
      <div className="grid gap-4">
        {GRUPOS.map(({ tipo, titulo }) => {
          const filas = alertas.filter((a) => a.tipo === tipo).sort(porFecha);
          if (filas.length === 0 && tipo !== 'FALTANTE_STOCK_PREVISTO') return null;
          return (
            <section key={tipo} aria-label={titulo}>
              <h3 className="mb-1 text-xs font-semibold text-meta">{titulo}</h3>
              {filas.length === 0 && (
                <p className="text-sm text-meta">Sin faltantes de stock previstos</p>
              )}
              <ul className="grid gap-1">
                {filas.map((a) => {
                  const { tono, icono: Icono, texto } = ESTILO[a.severidad];
                  return (
                    <li key={a.id} className="flex items-start gap-2 text-sm text-text">
                      <Icono aria-hidden className={`mt-0.5 size-4 shrink-0 ${tono}`} />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <span className="sr-only">{texto}: </span>
                        {a.descripcion}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {tipo === 'FALTANTE_STOCK_PREVISTO' && <StockVerificado generadaEn={generadaEn} />}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
