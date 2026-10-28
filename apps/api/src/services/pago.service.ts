import type { PagoIniciado, PagoInput, EstadoPagoComensal } from '@pgim/shared';
import { criterioDe } from '../domain/beneficio';
import { MARGEN_VENCIMIENTO_MIN, PAGO_VENCE_MIN, vencimientoDe } from '../domain/pago';
import { busEventos, type BusEventos } from '../domain/eventos';
import { AppError } from '../lib/errors';
import { pasarela as pasarelaPorDefecto, type PasarelaPago } from '../pagos/pasarela';
import type { FilaBeneficio } from '../repositories/fidelizacion.repository';
import {
  pagoRepository,
  type PagoRepository,
  type ResolucionPago,
  type ResultadoCobroPago,
  type ValidarBeneficio,
} from '../repositories/pago.repository';
import {
  beneficiosComensalRepository,
  clasificarBeneficios,
  type BeneficiosComensalRepository,
} from './beneficios-comensal.service';

// El beneficio elegido vale si clasificarBeneficios lo ofrecería como
// disponible en esta mesa: misma regla que ve el comensal en pantalla.
export function validarBeneficioElegido(ahora: () => Date): ValidarBeneficio {
  return (beneficio, eleg, mesa) =>
    clasificarBeneficios([beneficio], new Map(eleg ? [[beneficio.id, eleg]] : []), mesa, ahora())
      .disponibles[0]?.descuento ?? null;
}

// CU-06: pagar el saldo de la mesa con Mercado Pago (o la pasarela de prueba)
// y resolver el pago cuando llega el resultado.
export function createPagoService(
  repo: PagoRepository,
  pasarela: PasarelaPago,
  bus: BusEventos,
  beneficios: BeneficiosComensalRepository,
  ahora: () => Date = () => new Date(),
) {
  // Link de Mercado Pago de cada pago en curso, para "Continuar el pago". Vive
  // en memoria (el modelo no lo guarda): si la API se reinicia, el pago vence solo.
  const urls = new Map<string, string>();

  // Recompensas que este pago dejó listas: elegibles ahora y no antes. Solo
  // el monto y los puntos cambian al pagar (las visitas se cuentan al cerrar).
  async function desbloqueados(r: ResolucionPago): Promise<string[]> {
    const recompensas = (await beneficios.beneficiosActivos(r.restauranteId, ahora())).filter(
      (b): b is FilaBeneficio & { criterioTipo: 'MONTO' | 'PUNTOS' } =>
        b.clase === 'RECOMPENSA' && (b.criterioTipo === 'MONTO' || b.criterioTipo === 'PUNTOS'),
    );
    if (recompensas.length === 0) return [];
    const { porBeneficio } = await beneficios.elegibilidad(
      r.comensalId,
      r.restauranteId,
      recompensas,
    );
    return recompensas
      .filter((b) => {
        const e = porBeneficio.get(b.id);
        if (!e) return false;
        const antes =
          b.criterioTipo === 'MONTO'
            ? { ...e.datos, montoGastado: e.datos.montoGastado - r.monto }
            : { ...e.datos, puntos: e.datos.puntos - r.puntosSumados + r.puntosCanjeados };
        const criterio = criterioDe(b.criterioTipo, b.criterioValor);
        return criterio.esElegible(e.datos) && !criterio.esElegible(antes);
      })
      .map((b) => b.nombre);
  }

  // Un cobro aprobado que llega sobre un pago ya resuelto (rechazado por
  // vencimiento, o una preferencia pagada dos veces) no se acredita solo: queda
  // en el log para devolverlo o acreditarlo a mano.
  async function avisarCobroSinAcreditar(pagoId: string, referenciaExterna: string) {
    const actual = await repo.buscar(pagoId);
    if (!actual || actual.referenciaExterna === referenciaExterna) return;
    console.error(
      `Cobro ${referenciaExterna} aprobado en Mercado Pago sobre el pago ${pagoId}, ` +
        `que ya estaba ${actual.estado}: conciliar a mano (devolver o acreditar).`,
    );
  }

  async function resolver(pagoId: string, resultado: ResultadoCobroPago): Promise<void> {
    const r = await repo.resolver(pagoId, resultado);
    urls.delete(pagoId);
    if (!r) {
      if (resultado.estado === 'APROBADO') {
        await avisarCobroSinAcreditar(pagoId, resultado.referenciaExterna);
      }
      return;
    }
    const evento = {
      pagoId: r.pagoId,
      cuentaMesaId: r.cuentaMesaId,
      sucursalId: r.sucursalId,
      comensalId: r.comensalId,
    };
    if (r.estado === 'RECHAZADO') {
      bus.publicar({ tipo: 'PAGO_RECHAZADO', ...evento });
      return;
    }
    // Un error al calcular el aviso no deshace un pago ya aprobado.
    const nombres = await desbloqueados(r).catch((e) => {
      console.error('No se pudo calcular lo desbloqueado', e);
      return [];
    });
    bus.publicar({
      tipo: 'PAGO_APROBADO',
      ...evento,
      puntosSumados: r.puntosSumados,
      desbloqueados: nombres,
    });
  }

  return {
    urlDePago: (pagoId: string): string | null => urls.get(pagoId) ?? null,

    resolver,

    async pagar(comensalId: string, cuentaMesaId: string, input: PagoInput): Promise<PagoIniciado> {
      if (!pasarela.habilitada) throw new AppError(503, 'El pago no está habilitado');
      const r = await repo.crearPendiente(
        {
          comensalId,
          cuentaMesaId,
          metodo: input.metodo,
          beneficioId: input.beneficioId ?? null,
          ahora: ahora(),
        },
        validarBeneficioElegido(ahora),
      );
      switch (r.resultado) {
        case 'CERRADA':
          throw new AppError(409, 'La mesa ya está cerrada');
        case 'SIN_SALDO':
          throw new AppError(409, 'La mesa no tiene saldo para pagar');
        case 'EN_CURSO':
          throw new AppError(409, 'Ya tenés un pago en curso para esta mesa', {
            pagoId: r.pagoId,
          });
        case 'BENEFICIO_AGOTADO':
          throw new AppError(409, 'El beneficio se agotó. Elegí otro o pagá sin beneficio.');
        case 'BENEFICIO_NO_DISPONIBLE':
          throw new AppError(409, 'Ese beneficio ya no está disponible para esta mesa');
      }

      // Cubierto por el beneficio: no hay nada que cobrar.
      if (r.monto === 0) {
        await resolver(r.pagoId, {
          estado: 'APROBADO',
          referenciaExterna: `SIN-COBRO-${r.pagoId}`,
        });
        return { pagoId: r.pagoId, urlPago: null };
      }

      let inicio;
      try {
        inicio = await pasarela.iniciarCobro({
          id: r.pagoId,
          monto: r.monto,
          metodo: input.metodo,
          descripcion: `Mesa ${r.mesaNumero} — ${r.restaurante}`,
          venceEn: vencimientoDe(r.creadoEn),
        });
      } catch (e) {
        // Sin preferencia nadie pudo pagar: se rechaza ya y se puede reintentar.
        console.error('No se pudo iniciar el cobro', e);
        await resolver(r.pagoId, { estado: 'RECHAZADO' });
        throw new AppError(
          502,
          'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.',
        );
      }
      if (inicio.tipo === 'APROBADO_AL_INSTANTE') {
        await resolver(r.pagoId, {
          estado: 'APROBADO',
          referenciaExterna: inicio.referenciaExterna,
        });
        return { pagoId: r.pagoId, urlPago: null };
      }
      urls.set(r.pagoId, inicio.urlPago);
      return { pagoId: r.pagoId, urlPago: inicio.urlPago };
    },

    // Vuelve a abrir Mercado Pago para un pago en curso: con el mismo link o,
    // si se perdió (la API se reinició), con una preferencia nueva para el
    // mismo pago, que vence a la misma hora.
    async continuar(comensalId: string, pagoId: string): Promise<PagoIniciado> {
      const pago = await repo.pendienteDelComensal(comensalId, pagoId);
      if (!pago) throw new AppError(404, 'El pago no existe o ya se resolvió');
      const venceEn = vencimientoDe(pago.creadoEn);
      if (ahora() >= venceEn) {
        throw new AppError(409, 'El pago venció. En unos minutos vas a poder pagar de nuevo.');
      }
      const guardada = urls.get(pagoId);
      if (guardada) return { pagoId, urlPago: guardada };
      const inicio = await pasarela.iniciarCobro({
        id: pagoId,
        monto: pago.monto,
        metodo: pago.metodo,
        descripcion: `Mesa ${pago.mesaNumero} — ${pago.restaurante}`,
        venceEn,
      });
      if (inicio.tipo === 'APROBADO_AL_INSTANTE') {
        await resolver(pagoId, { estado: 'APROBADO', referenciaExterna: inicio.referenciaExterna });
        return { pagoId, urlPago: null };
      }
      urls.set(pagoId, inicio.urlPago);
      return { pagoId, urlPago: inicio.urlPago };
    },

    // Tarea programada: un PENDIENTE vencido (15 minutos más el margen) se
    // resuelve con lo que informe la pasarela sobre todos sus intentos. Si
    // alguno sigue en proceso, se espera a la próxima vuelta. Devuelve cuántos
    // resolvió.
    async vencerPendientes(instante: Date): Promise<number> {
      const limite = new Date(
        instante.getTime() - (PAGO_VENCE_MIN + MARGEN_VENCIMIENTO_MIN) * 60_000,
      );
      let resueltos = 0;
      for (const pagoId of await repo.pendientesVencidos(limite)) {
        try {
          const consulta = await pasarela.consultarPago(pagoId);
          if (consulta.estado === 'EN_PROCESO') continue;
          await resolver(
            pagoId,
            consulta.estado === 'APROBADO'
              ? {
                  estado: 'APROBADO',
                  referenciaExterna: consulta.referenciaExterna,
                  metodo: consulta.metodo,
                }
              : { estado: 'RECHAZADO' },
          );
          resueltos++;
        } catch (e) {
          console.error(`No se pudo vencer el pago ${pagoId}`, e);
        }
      }
      return resueltos;
    },

    async estado(comensalId: string, pagoId: string): Promise<EstadoPagoComensal> {
      const estado = await repo.estadoDelComensal(comensalId, pagoId);
      if (!estado) throw new AppError(404, 'El pago no existe');
      return estado;
    },
  };
}

export const pagoService = createPagoService(
  pagoRepository,
  pasarelaPorDefecto,
  busEventos,
  beneficiosComensalRepository,
);
