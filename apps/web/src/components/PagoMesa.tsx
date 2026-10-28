import { useEffect, useState } from 'react';
import { CircleCheck, Gift, LoaderCircle, Star, X } from 'lucide-react';
import {
  EVENTOS_SOCKET,
  type BeneficiosMesa,
  type EstadoPagoComensal,
  type PagoIniciado,
  type ProgresoBeneficio,
  type ResultadoPago,
} from '@pgim/shared';
import { ApiError, api } from '../lib/api';
import { formatoDiaYHora, formatoPesos } from '../lib/formato';
import { useEventoSocket } from '../lib/socket';
import { Aviso, Boton } from './ui';

// Piezas del pago de la mesa (CU-06) y del progreso de fidelidad del comensal.

const claseOpcion =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20';

function Opcion({
  nombre,
  valor,
  elegida,
  onElegir,
  children,
}: {
  nombre: string;
  valor: string;
  elegida: boolean;
  onElegir(): void;
  children: React.ReactNode;
}) {
  return (
    <label className={`${claseOpcion} ${elegida ? '' : 'border-line-strong bg-surface'}`}>
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={elegida}
        onChange={onElegir}
        className="size-4 accent-accent"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

// "3 de 5 visitas", "$ 12.000 de $ 20.000", "150 de 300 puntos".
export function textoProgreso({ actual, requerido, unidad }: ProgresoBeneficio): string {
  if (unidad === 'pesos') return `${formatoPesos(actual)} de ${formatoPesos(requerido)}`;
  return `${actual} de ${requerido} ${unidad}`;
}

export function BarraProgreso({
  nombre,
  progreso,
}: {
  nombre: string;
  progreso: ProgresoBeneficio;
}) {
  const porcentaje = Math.min(100, Math.round((progreso.actual / progreso.requerido) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="min-w-0 text-text">{nombre}</span>
        <span className="shrink-0 tabular-nums text-meta">{textoProgreso(progreso)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={nombre}
        aria-valuemin={0}
        aria-valuemax={progreso.requerido}
        aria-valuenow={progreso.actual}
        aria-valuetext={textoProgreso(progreso)}
        className="h-2 overflow-hidden rounded-full bg-panel"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}

// "Primera visita" solo se puede alcanzar sin pagos previos: no tiene sentido
// mostrarla como algo que falta.
export const conProgreso = (b: { progreso: ProgresoBeneficio }) =>
  b.progreso.unidad !== 'primera visita';

export function SeleccionPago({
  beneficios,
  beneficioId,
  onBeneficio,
}: {
  beneficios: BeneficiosMesa | null;
  beneficioId: string | null;
  onBeneficio(id: string | null): void;
}) {
  const disponibles = beneficios?.disponibles ?? [];
  const faltan = (beneficios?.noAlcanzados ?? []).filter(conProgreso);
  return (
    <div className="space-y-4">
      {disponibles.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
            <Gift aria-hidden className="size-4" /> Tus beneficios
          </legend>
          <p className="text-sm text-meta">Podés usar uno por mesa.</p>
          <Opcion
            nombre="beneficio"
            valor=""
            elegida={beneficioId === null}
            onElegir={() => onBeneficio(null)}
          >
            Sin beneficio
          </Opcion>
          {disponibles.map((b) => (
            <Opcion
              key={b.id}
              nombre="beneficio"
              valor={b.id}
              elegida={beneficioId === b.id}
              onElegir={() => onBeneficio(b.id)}
            >
              <span className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{b.nombre}</span>
                  <span className="block text-sm text-meta">{b.descripcion}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-accent-ink">
                  −{formatoPesos(b.descuento)}
                </span>
              </span>
            </Opcion>
          ))}
        </fieldset>
      )}
      {beneficios?.beneficioUsado && (
        <p className="text-sm text-meta">Ya usaste un beneficio en esta mesa.</p>
      )}

      <p className="text-sm text-meta">
        Pagás en Mercado Pago, con tarjeta o dinero en cuenta, y volvés acá. Tus datos de pago no
        pasan por el restaurante.
      </p>

      {faltan.length > 0 && (
        <section className="space-y-3 rounded-panel border border-line bg-surface p-4">
          <h2 className="font-semibold text-ink">Te falta poco</h2>
          {faltan.map((b) => (
            <BarraProgreso key={b.id} nombre={b.nombre} progreso={b.progreso} />
          ))}
        </section>
      )}
    </div>
  );
}

const ESPERA_CONSULTA_MS = 3000;
const ESPERA_LENTA_MS = 15_000;
const LIMITE_CONSULTA_MS = 30_000;

// Sigue un pago hasta que se resuelve: escucha el aviso en tiempo real y, por
// si el socket todavía no conectó al volver de Mercado Pago, consulta cada 3 s
// durante 30 s y después cada 15 s. No necesita la mesa: puede estar cerrada.
export function useSeguimientoPago(pagoId: string | null) {
  const [estado, setEstado] = useState<EstadoPagoComensal | null>(null);
  const [desbloqueados, setDesbloqueados] = useState<string[]>([]);
  const [demorado, setDemorado] = useState(false);

  useEffect(() => {
    setEstado(null);
    setDesbloqueados([]);
    setDemorado(false);
    if (!pagoId) return;
    let vigente = true;
    const inicio = Date.now();
    let espera: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const actual = await api<EstadoPagoComensal>(`/comensal/pagos/${pagoId}`);
        if (!vigente) return;
        setEstado(actual);
        if (actual.estado !== 'PENDIENTE') return;
      } catch {
        // Un corte momentáneo: se reintenta en la próxima vuelta.
      }
      if (!vigente) return;
      const lento = Date.now() - inicio >= LIMITE_CONSULTA_MS;
      if (lento) setDemorado(true);
      espera = setTimeout(consultar, lento ? ESPERA_LENTA_MS : ESPERA_CONSULTA_MS);
    };
    void consultar();
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [pagoId]);

  useEventoSocket<ResultadoPago>(EVENTOS_SOCKET.pagoResultado, (r) => {
    if (r.pagoId !== pagoId) return;
    setDesbloqueados(r.desbloqueados);
    // El comprobante llega con la consulta; si falla, la consulta periódica lo trae.
    api<EstadoPagoComensal>(`/comensal/pagos/${pagoId}`)
      .then(setEstado)
      .catch(() => {});
  });

  return { estado, desbloqueados, demorado };
}

// Vuelve a abrir Mercado Pago para un pago en curso (con el mismo link o uno
// nuevo si se perdió).
export function useContinuarPago() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function continuar(pagoId: string) {
    setEnviando(true);
    setError(null);
    try {
      const { urlPago } = await api<PagoIniciado>(`/comensal/pagos/${pagoId}/continuar`, {
        method: 'POST',
      });
      if (urlPago) window.location.assign(urlPago);
      else window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos abrir Mercado Pago');
      setEnviando(false);
    }
  }
  return { continuar, enviando, error };
}

export function ResultadoPagoVista({
  pagoId,
  estado,
  desbloqueados,
  demorado,
  sinAprobar,
  onListo,
}: {
  pagoId: string;
  estado: EstadoPagoComensal | null;
  desbloqueados: string[];
  demorado: boolean;
  // Mercado Pago avisó al volver que este intento no se aprobó: se puede probar
  // con otro medio en la misma página de pago mientras no venza.
  sinAprobar: boolean;
  onListo(): void;
}) {
  const retomar = useContinuarPago();
  if (!estado || estado.estado === 'PENDIENTE') {
    const volver = (
      <>
        <Boton
          densidad="comensal"
          disabled={retomar.enviando}
          onClick={() => retomar.continuar(pagoId)}
        >
          {retomar.enviando ? 'Abriendo Mercado Pago…' : 'Volver a Mercado Pago'}
        </Boton>
        <Aviso>{retomar.error}</Aviso>
      </>
    );
    if (sinAprobar) {
      return (
        <section role="alert" className="space-y-3 rounded-panel border border-line bg-surface p-4">
          <p className="font-semibold text-ink">El pago no se aprobó</p>
          <p className="text-sm text-meta">
            No se te cobró nada. Podés probar con otro medio en Mercado Pago. Si no lo completás, el
            pago vence a los 15 minutos y después podés volver a pagar.
          </p>
          {volver}
        </section>
      );
    }
    return (
      <section
        role="status"
        className="grid justify-items-center gap-2 rounded-panel border border-line bg-surface p-6 text-center"
      >
        <LoaderCircle aria-hidden className="size-7 animate-spin text-accent" />
        <p className="font-semibold text-ink">Confirmando el pago…</p>
        <p className="text-sm text-meta">
          {demorado
            ? 'Mercado Pago todavía no confirmó tu pago. Te avisamos acá cuando llegue.'
            : 'Esperamos la confirmación de Mercado Pago.'}
        </p>
        {demorado && volver}
      </section>
    );
  }

  if (estado.estado === 'RECHAZADO') {
    return (
      <section
        role="alert"
        className="space-y-3 rounded-panel border border-bad/30 bg-bad-soft p-4"
      >
        <p className="flex items-center gap-2 font-semibold text-bad">
          <X aria-hidden className="size-5" /> El pago no se aprobó
        </p>
        <p className="text-sm text-text">No se te cobró nada. Podés volver a intentarlo.</p>
        <Boton densidad="comensal" onClick={onListo}>
          Reintentar
        </Boton>
      </section>
    );
  }

  const { comprobante } = estado;
  return (
    <section role="status" className="space-y-4 rounded-panel border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-lg font-semibold text-ok">
        <CircleCheck aria-hidden className="size-6" /> Pago aprobado
      </p>
      {comprobante && (
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-meta">Comprobante</dt>
            <dd className="tabular-nums">{comprobante.numero}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-meta">Fecha</dt>
            <dd>{formatoDiaYHora(comprobante.fecha)} h</dd>
          </div>
          {comprobante.beneficio && (
            <div className="flex justify-between gap-3">
              <dt className="text-meta">{comprobante.beneficio}</dt>
              <dd className="tabular-nums">−{formatoPesos(comprobante.descuento)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 text-base font-semibold text-ink">
            <dt>Total pagado</dt>
            <dd className="tabular-nums">{formatoPesos(comprobante.total)}</dd>
          </div>
          <p className="pt-1 text-xs text-meta">Comprobante interno, sin validez fiscal.</p>
        </dl>
      )}
      {(estado.puntosSumados ?? 0) > 0 && (
        <p className="flex items-center gap-2 text-sm text-text">
          <Star aria-hidden className="size-4 text-accent" />
          Sumaste {estado.puntosSumados} puntos.
        </p>
      )}
      {desbloqueados.map((nombre) => (
        <p key={nombre} className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
          <Gift aria-hidden className="size-4" /> ¡Desbloqueaste {nombre}! Usalo en tu próxima
          visita.
        </p>
      ))}
      <Boton variante="secundario" densidad="comensal" onClick={onListo}>
        Listo
      </Boton>
    </section>
  );
}
