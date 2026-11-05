import {
  CRITERIOS,
  UMBRALES_POR_DEFECTO as U,
  aLuminancia,
  brillosCentrales,
  diametroPorEscala,
  diferenciaEntreCuadros,
  escalaPorDiametro,
  evaluarCalidad,
  exposicion,
  informeCalidadSchema,
  varianzaLaplaciano,
  type CriterioId,
  type MetadatosVideo,
  type MuestraCuadro,
} from '@pgim/shared';

const N = 64;

function uniforme(valor: number): MuestraCuadro {
  return { ancho: N, alto: N, luminancia: new Uint8Array(N * N).fill(valor) };
}

function tablero(): MuestraCuadro {
  const luminancia = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) luminancia[y * N + x] = (x + y) % 2 === 0 ? 0 : 255;
  return { ancho: N, alto: N, luminancia };
}

function centroBlanco(): MuestraCuadro {
  const c = uniforme(0);
  for (let y = N / 4; y < (3 * N) / 4; y++)
    for (let x = N / 4; x < (3 * N) / 4; x++) c.luminancia[y * N + x] = 255;
  return c;
}

const meta: MetadatosVideo = { ancho: 1920, alto: 1080, duracionS: 42 };

// Muestras sanas: textura nítida y un parche claro que crece de a poco, así la
// diferencia media entre cuadros consecutivos queda en ~0.053 (entre 0.04 y 0.25).
function sanas(): MuestraCuadro[] {
  return [0, 12, 24, 36].map((filas) => {
    const c = uniforme(128);
    for (let y = 0; y < filas; y++) for (let x = 0; x < N; x++) c.luminancia[y * N + x] = 200;
    for (let i = 0; i < N * N; i++) {
      const x = i % N;
      const y = Math.floor(i / N);
      c.luminancia[i] += (x + y) % 2 === 0 ? -20 : 20;
    }
    return c;
  });
}

function criterio(id: CriterioId) {
  return CRITERIOS.find((c) => c.id === id)!;
}

describe('funciones de imagen', () => {
  it('tablero nítido supera nitidezMin y uno uniforme no', () => {
    expect(varianzaLaplaciano(tablero())).toBeGreaterThan(U.nitidezMin);
    expect(varianzaLaplaciano(uniforme(128))).toBeLessThan(U.nitidezMin);
  });

  it('exposicion de una imagen blanca da quemadosPct 1', () => {
    const e = exposicion(uniforme(255));
    expect(e.quemadosPct).toBe(1);
    expect(e.negrosPct).toBe(0);
    expect(e.media).toBe(255);
    expect(exposicion(uniforme(0)).negrosPct).toBe(1);
  });

  it('brillosCentrales mira solo el centro', () => {
    expect(brillosCentrales(centroBlanco())).toBe(1);
    const bordes = uniforme(255);
    for (let y = N / 4; y < (3 * N) / 4; y++)
      for (let x = N / 4; x < (3 * N) / 4; x++) bordes.luminancia[y * N + x] = 0;
    expect(brillosCentrales(bordes)).toBe(0);
  });

  it('diferencia de cuadros iguales es 0 y de negro contra blanco es 1', () => {
    expect(diferenciaEntreCuadros(tablero(), tablero())).toBe(0);
    expect(diferenciaEntreCuadros(uniforme(0), uniforme(255))).toBe(1);
  });

  it('aLuminancia de rojo puro da 76', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const m = aLuminancia(rgba, 1, 1);
    expect(m.ancho).toBe(1);
    expect(m.alto).toBe(1);
    expect(m.luminancia[0]).toBe(76);
  });
});

describe('criterios', () => {
  it('Formato: OK, y RECHAZO por duración o resolución', () => {
    const f = criterio('FORMATO');
    const ok = f.evaluar([], meta, U);
    expect(ok.nivel).toBe('OK');
    expect(ok.mensaje).toBeNull();
    expect(ok.valor).toBe(42);

    const corto = f.evaluar([], { ...meta, duracionS: 5 }, U);
    expect(corto.nivel).toBe('RECHAZO');
    expect(corto.mensaje).toBe('El video tiene que durar entre 10 segundos y 3 minutos');
    expect(f.evaluar([], { ...meta, duracionS: 181 }, U).nivel).toBe('RECHAZO');

    const baja = f.evaluar([], { ancho: 640, alto: 360, duracionS: 42 }, U);
    expect(baja.nivel).toBe('RECHAZO');
    expect(baja.mensaje).toBe('La resolución es baja: grabá en 720p o más');

    const alta = f.evaluar([], { ancho: 7680, alto: 4320, duracionS: 42 }, U);
    expect(alta.nivel).toBe('RECHAZO');
    expect(alta.mensaje).toBe('La resolución es muy alta: grabá en 2160p como máximo');
  });

  it('formato acepta 1080×1920 vertical', () => {
    const f = criterio('FORMATO');
    expect(f.evaluar([], { ancho: 1080, alto: 1920, duracionS: 42 }, U).nivel).toBe('OK');
    expect(f.evaluar([], { ancho: 1920, alto: 1080, duracionS: 42 }, U).nivel).toBe('OK');
    expect(f.evaluar([], { ancho: 360, alto: 640, duracionS: 42 }, U).nivel).toBe('RECHAZO');
  });

  it('Nitidez: OK, ADVERTENCIA y RECHAZO', () => {
    const n = criterio('NITIDEZ');
    const bueno = tablero();
    const malo = uniforme(128);
    // 10 cuadros: 0 movidos -> OK; 3 (0.3 > 0.2) -> ADVERTENCIA; 6 (0.6 > 0.5) -> RECHAZO
    const mezcla = (movidos: number) => [
      ...Array(movidos).fill(malo),
      ...Array(10 - movidos).fill(bueno),
    ];
    const ok = n.evaluar(mezcla(0), meta, U);
    expect(ok.nivel).toBe('OK');
    expect(ok.mensaje).toBeNull();
    const adv = n.evaluar(mezcla(3), meta, U);
    expect(adv.nivel).toBe('ADVERTENCIA');
    expect(adv.mensaje).toBe('El video está movido: grabá más despacio');
    expect(n.evaluar(mezcla(6), meta, U).nivel).toBe('RECHAZO');
  });

  it('Exposición: OK, ADVERTENCIA y RECHAZO con ambos mensajes', () => {
    const e = criterio('EXPOSICION');
    expect(e.evaluar([uniforme(128)], meta, U).nivel).toBe('OK');

    // 20% de píxeles quemados, resto en 128: media ~153, recortados 0.2 -> ADVERTENCIA
    const algoQuemado = uniforme(128);
    for (let i = 0; i < Math.floor(N * N * 0.2); i++) algoQuemado.luminancia[i] = 255;
    const adv = e.evaluar([algoQuemado], meta, U);
    expect(adv.nivel).toBe('ADVERTENCIA');
    expect(adv.mensaje).toBe('Hay demasiada luz: evitá el sol o el flash directo');

    const oscuro = e.evaluar([uniforme(10)], meta, U);
    expect(oscuro.nivel).toBe('RECHAZO');
    expect(oscuro.mensaje).toBe('Hay poca luz: grabá con luz pareja, sin flash');

    const quemado = e.evaluar([uniforme(250)], meta, U);
    expect(quemado.nivel).toBe('RECHAZO');
    expect(quemado.mensaje).toBe('Hay demasiada luz: evitá el sol o el flash directo');

    // Mitad negros, mitad 200: media ~100 (en rango) pero recortados 0.5 -> RECHAZO por poca luz
    const mitad = uniforme(200);
    for (let i = 0; i < (N * N) / 2; i++) mitad.luminancia[i] = 0;
    const dominanNegros = e.evaluar([mitad], meta, U);
    expect(dominanNegros.nivel).toBe('RECHAZO');
    expect(dominanNegros.mensaje).toBe('Hay poca luz: grabá con luz pareja, sin flash');
  });

  it('Brillos: OK y ADVERTENCIA, nunca RECHAZO', () => {
    const b = criterio('BRILLOS');
    expect(b.evaluar([uniforme(128)], meta, U).nivel).toBe('OK');
    const r = b.evaluar([centroBlanco()], meta, U);
    expect(r.nivel).toBe('ADVERTENCIA');
    expect(r.valor).toBe(1);
    expect(r.mensaje).toBe('Hay muchos reflejos: evitá la luz directa sobre el plato');
  });

  it('Recorrido: OK, ADVERTENCIA y RECHAZO (quieto y con saltos)', () => {
    const r = criterio('RECORRIDO');
    const a = uniforme(100);
    const conDif = (d: number) => uniforme(100 + Math.round(d * 255));
    // diferencia media 0.05: OK
    expect(r.evaluar([a, conDif(0.05), a, conDif(0.05)], meta, U).nivel).toBe('OK');
    // 0.03: entre diferenciaMin y recorridoAdvertenciaMin -> ADVERTENCIA
    const adv = r.evaluar([a, conDif(0.03), a, conDif(0.03)], meta, U);
    expect(adv.nivel).toBe('ADVERTENCIA');
    expect(adv.mensaje).toBe('Da una vuelta lenta y completa alrededor del plato');
    // quieto
    const quieto = r.evaluar([a, a, a, a], meta, U);
    expect(quieto.nivel).toBe('RECHAZO');
    expect(quieto.mensaje).toBe('Da una vuelta lenta y completa alrededor del plato');
    // saltos: 4 diferencias, 2 de 0.5 (> saltoMin) => 50% > 20%
    const saltos = r.evaluar([a, conDif(0.5), conDif(0.5), uniforme(100), uniforme(100)], meta, U);
    expect(saltos.nivel).toBe('RECHAZO');
    expect(saltos.mensaje).toBe('El video tiene cortes o sacudidas: grabá de un tirón y sin apuro');
  });
});

describe('evaluarCalidad', () => {
  it('toma el peor nivel y aplica los criterios en orden', () => {
    const muestras = sanas();
    const bueno = evaluarCalidad(muestras, meta, U);
    expect(bueno.version).toBe(1);
    expect(bueno.criterios.map((c) => c.criterio)).toEqual(CRITERIOS.map((c) => c.id));
    expect(bueno.nivelGlobal).toBe('OK');

    const rechazo = evaluarCalidad(muestras, { ...meta, duracionS: 2 }, U);
    expect(rechazo.nivelGlobal).toBe('RECHAZO');

    const adv = evaluarCalidad(
      muestras.map(() => centroBlanco()).map((c, i) => (i === 0 ? c : muestras[i])),
      meta,
      U,
    );
    expect(['ADVERTENCIA', 'RECHAZO']).toContain(adv.nivelGlobal);
  });

  it('informeCalidadSchema rechaza nivelGlobal desconocido y acepta un informe de evaluarCalidad', () => {
    const informe = evaluarCalidad(sanas(), meta, U);
    expect(informeCalidadSchema.safeParse(informe).success).toBe(true);
    expect(informeCalidadSchema.safeParse({ ...informe, nivelGlobal: 'MAL' }).success).toBe(false);
  });
});

describe('escala por diámetro', () => {
  it('escalaPorDiametro(26, 0.13, 0.1) es 2 y diametroPorEscala es su inversa', () => {
    expect(escalaPorDiametro(26, 0.13, 0.1)).toBeCloseTo(2, 10);
    expect(diametroPorEscala(2, 0.13, 0.1)).toBe(26);
  });
});
