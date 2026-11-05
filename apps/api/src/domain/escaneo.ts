import type { EstadoEscaneo } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Patrón State del escaneo (diagrama de estados estado/escaneo-plato/v1). Cada
// estado decide qué transición admite y devuelve el estado siguiente; el
// servicio persiste el cambio.

export interface EstadoDeEscaneo {
  readonly nombre: EstadoEscaneo;
  enviar(): EstadoEscaneo; // PENDIENTE → PROCESANDO
  completar(): EstadoEscaneo; // PROCESANDO → EN_REVISION
  fallar(): EstadoEscaneo; // PENDIENTE | PROCESANDO → FALLIDO
  publicar(): EstadoEscaneo; // EN_REVISION → PUBLICADO
  descartar(): EstadoEscaneo; // EN_REVISION → DESCARTADO
}

// Los que bloquean un escaneo nuevo del mismo plato.
export const ESTADOS_ESCANEO_ACTIVOS: EstadoEscaneo[] = ['PENDIENTE', 'PROCESANDO', 'EN_REVISION'];

const ETIQUETA: Record<EstadoEscaneo, string> = {
  PENDIENTE: 'pendiente',
  PROCESANDO: 'en proceso',
  EN_REVISION: 'en revisión',
  PUBLICADO: 'publicado',
  DESCARTADO: 'descartado',
  FALLIDO: 'fallido',
};

abstract class EstadoBase implements EstadoDeEscaneo {
  constructor(readonly nombre: EstadoEscaneo) {}

  protected invalida(): never {
    throw new AppError(409, `El escaneo ya está ${ETIQUETA[this.nombre]}`);
  }

  enviar(): EstadoEscaneo {
    return this.invalida();
  }

  completar(): EstadoEscaneo {
    return this.invalida();
  }

  fallar(): EstadoEscaneo {
    return this.invalida();
  }

  publicar(): EstadoEscaneo {
    return this.invalida();
  }

  descartar(): EstadoEscaneo {
    return this.invalida();
  }
}

class EscaneoPendiente extends EstadoBase {
  constructor() {
    super('PENDIENTE');
  }

  override enviar(): EstadoEscaneo {
    return 'PROCESANDO';
  }

  override fallar(): EstadoEscaneo {
    return 'FALLIDO';
  }
}

class EscaneoProcesando extends EstadoBase {
  constructor() {
    super('PROCESANDO');
  }

  override completar(): EstadoEscaneo {
    return 'EN_REVISION';
  }

  override fallar(): EstadoEscaneo {
    return 'FALLIDO';
  }
}

class EscaneoEnRevision extends EstadoBase {
  constructor() {
    super('EN_REVISION');
  }

  override publicar(): EstadoEscaneo {
    return 'PUBLICADO';
  }

  override descartar(): EstadoEscaneo {
    return 'DESCARTADO';
  }
}

// PUBLICADO, DESCARTADO y FALLIDO: estados finales, sin transiciones.
class EscaneoFinalizado extends EstadoBase {}

const ESTADOS: Record<EstadoEscaneo, EstadoDeEscaneo> = {
  PENDIENTE: new EscaneoPendiente(),
  PROCESANDO: new EscaneoProcesando(),
  EN_REVISION: new EscaneoEnRevision(),
  PUBLICADO: new EscaneoFinalizado('PUBLICADO'),
  DESCARTADO: new EscaneoFinalizado('DESCARTADO'),
  FALLIDO: new EscaneoFinalizado('FALLIDO'),
};

export function estadoDeEscaneo(estado: EstadoEscaneo): EstadoDeEscaneo {
  return ESTADOS[estado];
}
