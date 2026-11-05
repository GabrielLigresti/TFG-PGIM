import { z } from 'zod';

// Verificación de calidad del video de un escaneo. Todo son funciones puras
// sobre muestras de luminancia: el navegador extrae los cuadros y evalúa; la API
// solo revalida el formato (duración y resolución leídas del MP4).

export type NivelCalidad = 'OK' | 'ADVERTENCIA' | 'RECHAZO';
export type CriterioId = 'FORMATO' | 'NITIDEZ' | 'EXPOSICION' | 'BRILLOS' | 'RECORRIDO';

export interface MuestraCuadro {
  ancho: number;
  alto: number;
  luminancia: Uint8Array;
}
export interface MetadatosVideo {
  ancho: number;
  alto: number;
  duracionS: number;
}
export interface UmbralesCalidad {
  ladoMenorMinPx: number;
  ladoMenorMaxPx: number;
  duracionMinS: number;
  duracionMaxS: number;
  nitidezMin: number;
  nitidezAdvertenciaPct: number;
  nitidezRechazoPct: number;
  luminanciaMin: number;
  luminanciaMax: number;
  recortadosAdvertenciaPct: number;
  recortadosRechazoPct: number;
  brillosAdvertenciaPct: number;
  diferenciaMin: number;
  recorridoAdvertenciaMin: number;
  saltoMin: number;
  saltosRechazoPct: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesCalidad = {
  ladoMenorMinPx: 720,
  ladoMenorMaxPx: 2160,
  duracionMinS: 10,
  duracionMaxS: 180,
  nitidezMin: 100,
  nitidezAdvertenciaPct: 0.2,
  nitidezRechazoPct: 0.5,
  luminanciaMin: 40,
  luminanciaMax: 220,
  recortadosAdvertenciaPct: 0.1,
  recortadosRechazoPct: 0.3,
  brillosAdvertenciaPct: 0.15,
  diferenciaMin: 0.02,
  recorridoAdvertenciaMin: 0.04,
  saltoMin: 0.25,
  saltosRechazoPct: 0.2,
};

export interface ResultadoCriterio {
  criterio: CriterioId;
  nivel: NivelCalidad;
  valor: number;
  mensaje: string | null;
}
export interface InformeCalidad {
  version: 1;
  nivelGlobal: NivelCalidad;
  metadatos: MetadatosVideo;
  criterios: ResultadoCriterio[];
}
export interface CriterioCalidad {
  id: CriterioId;
  evaluar(
    muestras: MuestraCuadro[],
    metadatos: MetadatosVideo,
    umbrales: UmbralesCalidad,
  ): ResultadoCriterio;
}

// --- Funciones de imagen ---

export function aLuminancia(rgba: Uint8ClampedArray, ancho: number, alto: number): MuestraCuadro {
  const luminancia = new Uint8Array(ancho * alto);
  for (let i = 0; i < luminancia.length; i++) {
    const o = i * 4;
    luminancia[i] = Math.round(
      0.299 * (rgba[o] ?? 0) + 0.587 * (rgba[o + 1] ?? 0) + 0.114 * (rgba[o + 2] ?? 0),
    );
  }
  return { ancho, alto, luminancia };
}

export function varianzaLaplaciano(c: MuestraCuadro): number {
  const { ancho, alto, luminancia: l } = c;
  if (ancho < 3 || alto < 3) return 0;
  let suma = 0;
  let sumaCuad = 0;
  let n = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const r =
        (l[i - ancho] ?? 0) +
        (l[i + ancho] ?? 0) +
        (l[i - 1] ?? 0) +
        (l[i + 1] ?? 0) -
        4 * (l[i] ?? 0);
      suma += r;
      sumaCuad += r * r;
      n++;
    }
  }
  const media = suma / n;
  return sumaCuad / n - media * media;
}

export function exposicion(c: MuestraCuadro): {
  media: number;
  quemadosPct: number;
  negrosPct: number;
} {
  const total = c.luminancia.length;
  if (total === 0) return { media: 0, quemadosPct: 0, negrosPct: 0 };
  let suma = 0;
  let quemados = 0;
  let negros = 0;
  for (let i = 0; i < total; i++) {
    const v = c.luminancia[i] ?? 0;
    suma += v;
    if (v >= 250) quemados++;
    else if (v <= 5) negros++;
  }
  return { media: suma / total, quemadosPct: quemados / total, negrosPct: negros / total };
}

export function brillosCentrales(c: MuestraCuadro): number {
  const x0 = Math.ceil(c.ancho / 4);
  const x1 = Math.ceil((3 * c.ancho) / 4);
  const y0 = Math.ceil(c.alto / 4);
  const y1 = Math.ceil((3 * c.alto) / 4);
  let total = 0;
  let brillantes = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      if ((c.luminancia[y * c.ancho + x] ?? 0) >= 240) brillantes++;
    }
  }
  return total === 0 ? 0 : brillantes / total;
}

export function diferenciaEntreCuadros(a: MuestraCuadro, b: MuestraCuadro): number {
  const n = Math.min(a.luminancia.length, b.luminancia.length);
  if (n === 0) return 0;
  let suma = 0;
  for (let i = 0; i < n; i++) suma += Math.abs((a.luminancia[i] ?? 0) - (b.luminancia[i] ?? 0));
  return suma / n / 255;
}

// --- Criterios ---

const media = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

const resultado = (
  criterio: CriterioId,
  nivel: NivelCalidad,
  valor: number,
  mensaje: string,
): ResultadoCriterio => ({ criterio, nivel, valor, mensaje: nivel === 'OK' ? null : mensaje });

const criterioFormato: CriterioCalidad = {
  id: 'FORMATO',
  evaluar(_muestras, m, u) {
    // Lado menor y mayor: un video vertical 1080×1920 vale igual que 1920×1080.
    const ladoMenor = Math.min(m.ancho, m.alto);
    if (m.duracionS < u.duracionMinS || m.duracionS > u.duracionMaxS) {
      const maxMin = Math.round(u.duracionMaxS / 60);
      return resultado(
        'FORMATO',
        'RECHAZO',
        m.duracionS,
        `El video tiene que durar entre ${u.duracionMinS} segundos y ${maxMin} minutos`,
      );
    }
    if (ladoMenor < u.ladoMenorMinPx) {
      return resultado(
        'FORMATO',
        'RECHAZO',
        m.duracionS,
        `La resolución es baja: grabá en ${u.ladoMenorMinPx}p o más`,
      );
    }
    if (ladoMenor > u.ladoMenorMaxPx) {
      return resultado(
        'FORMATO',
        'RECHAZO',
        m.duracionS,
        `La resolución es muy alta: grabá en ${u.ladoMenorMaxPx}p como máximo`,
      );
    }
    return resultado('FORMATO', 'OK', m.duracionS, '');
  },
};

const criterioNitidez: CriterioCalidad = {
  id: 'NITIDEZ',
  evaluar(muestras, _m, u) {
    const movidos = muestras.filter((c) => varianzaLaplaciano(c) < u.nitidezMin).length;
    const pct = muestras.length === 0 ? 0 : movidos / muestras.length;
    const nivel: NivelCalidad =
      pct > u.nitidezRechazoPct ? 'RECHAZO' : pct > u.nitidezAdvertenciaPct ? 'ADVERTENCIA' : 'OK';
    return resultado('NITIDEZ', nivel, pct, 'El video está movido: grabá más despacio');
  },
};

const criterioExposicion: CriterioCalidad = {
  id: 'EXPOSICION',
  evaluar(muestras, _m, u) {
    const e = muestras.map(exposicion);
    const mediaLuz = media(e.map((x) => x.media));
    const quemados = media(e.map((x) => x.quemadosPct));
    const negros = media(e.map((x) => x.negrosPct));
    const recortados = quemados + negros;
    let nivel: NivelCalidad = 'OK';
    if (
      mediaLuz < u.luminanciaMin ||
      mediaLuz > u.luminanciaMax ||
      recortados > u.recortadosRechazoPct
    ) {
      nivel = 'RECHAZO';
    } else if (recortados > u.recortadosAdvertenciaPct) {
      nivel = 'ADVERTENCIA';
    }
    const pocaLuz = negros > quemados || mediaLuz < u.luminanciaMin;
    return resultado(
      'EXPOSICION',
      nivel,
      mediaLuz,
      pocaLuz
        ? 'Hay poca luz: grabá con luz pareja, sin flash'
        : 'Hay demasiada luz: evitá el sol o el flash directo',
    );
  },
};

const criterioBrillos: CriterioCalidad = {
  id: 'BRILLOS',
  evaluar(muestras, _m, u) {
    const v = media(muestras.map(brillosCentrales));
    const nivel: NivelCalidad = v > u.brillosAdvertenciaPct ? 'ADVERTENCIA' : 'OK';
    return resultado(
      'BRILLOS',
      nivel,
      v,
      'Hay muchos reflejos: evitá la luz directa sobre el plato',
    );
  },
};

const criterioRecorrido: CriterioCalidad = {
  id: 'RECORRIDO',
  evaluar(muestras, _m, u) {
    const difs: number[] = [];
    muestras.forEach((cuadro, i) => {
      const anterior = muestras[i - 1];
      if (anterior) difs.push(diferenciaEntreCuadros(anterior, cuadro));
    });
    const prom = media(difs);
    const saltos = difs.length === 0 ? 0 : difs.filter((d) => d > u.saltoMin).length / difs.length;
    const quieto = 'Da una vuelta lenta y completa alrededor del plato';
    const conSaltos = 'El video tiene cortes o sacudidas: grabá de un tirón y sin apuro';
    if (saltos > u.saltosRechazoPct) return resultado('RECORRIDO', 'RECHAZO', prom, conSaltos);
    if (prom < u.diferenciaMin) return resultado('RECORRIDO', 'RECHAZO', prom, quieto);
    if (prom < u.recorridoAdvertenciaMin)
      return resultado('RECORRIDO', 'ADVERTENCIA', prom, quieto);
    return resultado('RECORRIDO', 'OK', prom, '');
  },
};

export const CRITERIOS: CriterioCalidad[] = [
  criterioFormato,
  criterioNitidez,
  criterioExposicion,
  criterioBrillos,
  criterioRecorrido,
];

const ORDEN_NIVEL: Record<NivelCalidad, number> = { OK: 0, ADVERTENCIA: 1, RECHAZO: 2 };

export function evaluarCalidad(
  muestras: MuestraCuadro[],
  metadatos: MetadatosVideo,
  umbrales: UmbralesCalidad,
): InformeCalidad {
  const criterios = CRITERIOS.map((c) => c.evaluar(muestras, metadatos, umbrales));
  const nivelGlobal = criterios.reduce<NivelCalidad>(
    (peor, c) => (ORDEN_NIVEL[c.nivel] > ORDEN_NIVEL[peor] ? c.nivel : peor),
    'OK',
  );
  return { version: 1, nivelGlobal, metadatos, criterios };
}

const nivelCalidadSchema = z.enum(['OK', 'ADVERTENCIA', 'RECHAZO']);

export const informeCalidadSchema: z.ZodType<InformeCalidad> = z.object({
  version: z.literal(1),
  nivelGlobal: nivelCalidadSchema,
  metadatos: z.object({
    ancho: z.number(),
    alto: z.number(),
    duracionS: z.number(),
  }),
  criterios: z.array(
    z.object({
      criterio: z.enum(['FORMATO', 'NITIDEZ', 'EXPOSICION', 'BRILLOS', 'RECORRIDO']),
      nivel: nivelCalidadSchema,
      valor: z.number(),
      mensaje: z.string().nullable(),
    }),
  ),
});

// --- Escala del modelo ---

export function escalaPorDiametro(
  diametroCm: number,
  anchoM: number,
  profundidadM: number,
): number {
  return diametroCm / 100 / Math.max(anchoM, profundidadM);
}

export function diametroPorEscala(escala: number, anchoM: number, profundidadM: number): number {
  return Math.round(escala * Math.max(anchoM, profundidadM) * 100 * 10) / 10;
}
