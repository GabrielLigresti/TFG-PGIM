import type { ConsultaCobro, MetodoPago, PasarelaPago } from './pasarela';

// Checkout Pro de Mercado Pago por su API REST. Los datos de la tarjeta nunca
// pasan por PGIM: el comensal paga en la página de Mercado Pago y vuelve a
// "Mi mesa" por las back_urls.

const API = 'https://api.mercadopago.com';

export interface ConfigMercadoPago {
  accessToken: string;
  // URL pública (el túnel en desarrollo): webhook y regreso del comensal.
  publicUrl: string;
  fetch?: typeof fetch;
}

// Sin respuesta en este tiempo, el pago o la tarea no quedan colgados.
const TIMEOUT_MS = 10_000;

// El efectivo (Rapipago, Pago Fácil) queda siempre afuera: el pago tiene que
// resolverse mientras el comensal está en la mesa.
const EXCLUIDOS: Record<MetodoPago, string[]> = {
  TARJETA: ['account_money', 'ticket', 'atm'],
  BILLETERA_VIRTUAL: ['credit_card', 'debit_card', 'prepaid_card', 'ticket', 'atm'],
};

const EN_PROCESO = new Set(['pending', 'in_process', 'authorized']);

interface CobroMp {
  id: number | string;
  status: string;
  external_reference?: string | null;
  payment_type_id?: string;
}

const metodoDe = (tipo: string | undefined): MetodoPago =>
  tipo === 'account_money' ? 'BILLETERA_VIRTUAL' : 'TARJETA';

const estadoDe = (status: string) =>
  status === 'approved' ? 'APROBADO' : EN_PROCESO.has(status) ? 'EN_PROCESO' : 'SIN_APROBAR';

async function llamar<T>(config: ConfigMercadoPago, ruta: string, cuerpo?: unknown): Promise<T> {
  const respuesta = await (config.fetch ?? fetch)(`${API}${ruta}`, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
  // Sin el cuerpo de la respuesta ni los encabezados: nunca el token en un log.
  if (!respuesta.ok)
    throw new Error(`Mercado Pago respondió ${respuesta.status} en ${ruta.split('?')[0]}`);
  return (await respuesta.json()) as T;
}

export function crearPasarelaMercadoPago(config: ConfigMercadoPago): PasarelaPago {
  return {
    habilitada: true,

    async iniciarCobro(pago) {
      const regreso = `${config.publicUrl}/mesa?pago=${pago.id}`;
      const preferencia = await llamar<{ init_point: string }>(config, '/checkout/preferences', {
        items: [
          { title: pago.descripcion, quantity: 1, unit_price: pago.monto, currency_id: 'ARS' },
        ],
        external_reference: pago.id,
        notification_url: `${config.publicUrl}/api/pagos/webhook/mercadopago`,
        back_urls: { success: regreso, failure: regreso, pending: regreso },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: pago.venceEn.toISOString(),
        payment_methods: { excluded_payment_types: EXCLUIDOS[pago.metodo].map((id) => ({ id })) },
      });
      return { tipo: 'REDIRECCION', urlPago: preferencia.init_point };
    },

    // Todos los intentos de la preferencia: uno rechazado no cierra el pago si
    // después hubo otro aprobado o todavía en proceso.
    async consultarPago(pagoId): Promise<ConsultaCobro> {
      const { results } = await llamar<{ results: CobroMp[] }>(
        config,
        `/v1/payments/search?external_reference=${encodeURIComponent(pagoId)}`,
      );
      const aprobado = results.find((c) => c.status === 'approved');
      if (aprobado) {
        return {
          estado: 'APROBADO',
          referenciaExterna: String(aprobado.id),
          metodo: metodoDe(aprobado.payment_type_id),
        };
      }
      return results.some((c) => EN_PROCESO.has(c.status))
        ? { estado: 'EN_PROCESO' }
        : { estado: 'SIN_APROBAR' };
    },
  };
}

// El cobro que nombra una notificación, consultado a Mercado Pago (el cuerpo
// de la notificación no se usa como fuente).
export async function obtenerCobro(
  config: ConfigMercadoPago,
  idCobro: string,
): Promise<{
  estado: 'APROBADO' | 'EN_PROCESO' | 'SIN_APROBAR';
  pagoId: string | null;
  referenciaExterna: string;
  metodo: MetodoPago;
}> {
  const cobro = await llamar<CobroMp>(config, `/v1/payments/${encodeURIComponent(idCobro)}`);
  return {
    estado: estadoDe(cobro.status),
    pagoId: cobro.external_reference ?? null,
    referenciaExterna: String(cobro.id),
    metodo: metodoDe(cobro.payment_type_id),
  };
}
