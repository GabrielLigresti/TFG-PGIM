import {
  RecetaBuilder,
  RecetaInvalidaError,
  cantidadBruta,
  contiene,
  costoTotal,
  costoUnitario,
  insumosNecesarios,
  tieneStock,
  type Componente,
} from './receta';

function insumo(
  id: string,
  unidadBase: Componente['unidadBase'],
  costoCompraVigente: number,
): Componente {
  return {
    id,
    nombre: id,
    tipo: 'INSUMO',
    unidadBase,
    activo: true,
    costoCompraVigente,
    llevaStock: false,
    receta: null,
  };
}

function intermedio(id: string, unidadBase: Componente['unidadBase'] = 'GRAMO'): Componente {
  return {
    id,
    nombre: id,
    tipo: 'INTERMEDIO',
    unidadBase,
    activo: true,
    costoCompraVigente: null,
    llevaStock: false,
    receta: null,
  };
}

const carne = insumo('carne', 'GRAMO', 0.01);
const aceite = insumo('aceite', 'MILILITRO', 0.002);
const huevo = insumo('huevo', 'UNIDAD', 150);

function errores(construir: () => unknown) {
  try {
    construir();
  } catch (e) {
    if (e instanceof RecetaInvalidaError) return e.errores;
    throw e;
  }
  throw new Error('Se esperaba una receta inválida');
}

describe('RecetaBuilder', () => {
  it('construye una receta válida convirtiendo kg a la unidad base', () => {
    const receta = RecetaBuilder.paraItem()
      .agregarLinea(carne, 0.3, 'KILOGRAMO', 0)
      .agregarLinea(huevo, 2, 'UNIDAD', 0)
      .conRendimiento(1)
      .conInstrucciones('  A la parrilla  ')
      .build();

    expect(receta.lineas).toHaveLength(2);
    expect(receta.instrucciones).toBe('A la parrilla');
    expect(cantidadBruta(receta.lineas[0]!)).toBe(300);
  });

  it('E1: marca la línea con una unidad de otra dimensión', () => {
    const lista = errores(() =>
      RecetaBuilder.paraItem()
        .agregarLinea(carne, 100, 'GRAMO', 0)
        .agregarLinea(aceite, 1, 'KILOGRAMO', 0)
        .conRendimiento(1)
        .build(),
    );

    expect(lista).toEqual([{ linea: 1, mensaje: expect.stringContaining('se mide en ml') }]);
  });

  it('E3: rechaza una receta sin líneas y con rendimiento 0', () => {
    const lista = errores(() => RecetaBuilder.paraItem().conRendimiento(0).build());

    expect(lista.map((e) => e.linea)).toEqual([null, null]);
  });

  it('valida cantidad, merma, componentes repetidos y dados de baja', () => {
    const lista = errores(() =>
      RecetaBuilder.paraItem()
        .agregarLinea(carne, 0, 'GRAMO', 0)
        .agregarLinea(aceite, 10, 'MILILITRO', 100)
        .agregarLinea(huevo, 1, 'UNIDAD', 0)
        .agregarLinea(huevo, 1, 'UNIDAD', 0)
        .agregarLinea({ ...insumo('sal', 'GRAMO', 0), activo: false }, 1, 'GRAMO', 0)
        .conRendimiento(1)
        .build(),
    );

    expect(lista.map((e) => e.linea)).toEqual([0, 1, 3, 4]);
  });

  it('E2: rechaza que un intermedio se use a sí mismo', () => {
    const salsa = intermedio('salsa');

    const lista = errores(() =>
      RecetaBuilder.paraIntermedio(salsa)
        .agregarLinea(salsa, 10, 'GRAMO', 0)
        .conRendimiento(1)
        .build(),
    );

    expect(lista[0]?.mensaje).toContain('propia receta');
  });

  it('E2: detecta un ciclo indirecto y explica la dependencia', () => {
    // base → salsa; al editar base, agregar salsa cerraría el ciclo.
    const base = intermedio('base');
    const salsa = intermedio('salsa');
    salsa.receta = {
      lineas: [{ componente: base, cantidad: 10, unidad: 'GRAMO', porcentajeMerma: 0 }],
      rendimiento: 100,
      instrucciones: null,
    };

    const lista = errores(() =>
      RecetaBuilder.paraIntermedio(base)
        .agregarLinea(salsa, 10, 'GRAMO', 0)
        .conRendimiento(1)
        .build(),
    );

    expect(lista[0]?.mensaje).toBe('Generaría un ciclo: base → salsa → base');
    expect(contiene(salsa, 'base')).toBe(true);
    expect(contiene(base, 'salsa')).toBe(false);
  });
});

describe('costos', () => {
  it('aplica la merma: bruta = neta ÷ (1 − merma)', () => {
    const receta = RecetaBuilder.paraItem()
      .agregarLinea(carne, 400, 'GRAMO', 20)
      .conRendimiento(2)
      .build();

    expect(cantidadBruta(receta.lineas[0]!)).toBeCloseTo(500);
    expect(costoTotal(receta)).toBeCloseTo(5);
  });

  it('calcula el costo de un intermedio por unidad de rendimiento, en forma recursiva', () => {
    const salsa = intermedio('salsa', 'MILILITRO');
    salsa.receta = RecetaBuilder.paraIntermedio(salsa)
      .agregarLinea(aceite, 500, 'MILILITRO', 0)
      .conRendimiento(1000)
      .build();

    expect(costoUnitario(salsa)).toBeCloseTo(0.001);

    const plato = RecetaBuilder.paraItem()
      .agregarLinea(carne, 300, 'GRAMO', 0)
      .agregarLinea(salsa, 50, 'MILILITRO', 0)
      .conRendimiento(1)
      .build();
    expect(costoTotal(plato)).toBeCloseTo(3.05);
  });
});

describe('insumosNecesarios', () => {
  const harina = insumo('harina', 'GRAMO', 2);
  const queso = insumo('queso', 'GRAMO', 5);
  const linea = (
    componente: Componente,
    cantidad: number,
    unidad: 'GRAMO' | 'KILOGRAMO' = 'GRAMO',
    porcentajeMerma = 0,
  ) => ({
    componente,
    cantidad,
    unidad,
    porcentajeMerma,
  });

  it('escala la cantidad por porciones sobre el rendimiento', () => {
    const receta = { lineas: [linea(harina, 100)], rendimiento: 2, instrucciones: null };
    expect(insumosNecesarios(receta, 3)).toEqual(new Map([['harina', 150]]));
  });

  it('descuenta la cantidad bruta, con la merma', () => {
    const receta = {
      lineas: [linea(harina, 80, 'GRAMO', 20)],
      rendimiento: 1,
      instrucciones: null,
    };
    expect(insumosNecesarios(receta, 1).get('harina')).toBeCloseTo(100);
  });

  it('convierte a la unidad base', () => {
    const receta = {
      lineas: [linea(harina, 0.1, 'KILOGRAMO')],
      rendimiento: 1,
      instrucciones: null,
    };
    expect(insumosNecesarios(receta, 1).get('harina')).toBeCloseTo(100);
  });

  it('explota los intermedios hasta los insumos', () => {
    const masa = intermedio('masa');
    masa.receta = { lineas: [linea(harina, 200)], rendimiento: 400, instrucciones: null };
    const pizza = {
      lineas: [linea(masa, 100), linea(queso, 50)],
      rendimiento: 1,
      instrucciones: null,
    };
    expect(insumosNecesarios(pizza, 2)).toEqual(
      new Map([
        ['harina', 100],
        ['queso', 100],
      ]),
    );
  });

  it('suma en una sola clave el insumo que llega por dos caminos', () => {
    const masa = intermedio('masa');
    masa.receta = { lineas: [linea(harina, 200)], rendimiento: 400, instrucciones: null };
    const receta = {
      lineas: [linea(masa, 100), linea(harina, 10)],
      rendimiento: 1,
      instrucciones: null,
    };
    expect(insumosNecesarios(receta, 1)).toEqual(new Map([['harina', 60]]));
  });

  it('un intermedio sin receta no aporta nada', () => {
    const receta = {
      lineas: [linea(intermedio('salsa'), 50)],
      rendimiento: 1,
      instrucciones: null,
    };
    expect(insumosNecesarios(receta, 1).size).toBe(0);
  });
});

describe('componentes con stock', () => {
  const tomate = insumo('tomate', 'GRAMO', 0.002);
  const cebolla = insumo('cebolla', 'GRAMO', 0.001);
  const linea = (componente: Componente, cantidad: number) => ({
    componente,
    cantidad,
    unidad: 'GRAMO' as const,
    porcentajeMerma: 0,
  });
  const receta = (lineas: ReturnType<typeof linea>[], rendimiento = 1) => ({
    lineas,
    rendimiento,
    instrucciones: null,
  });

  // Aderezo sin stock: 100 g de cebolla rinden 100 g.
  const aderezo = intermedio('aderezo');
  aderezo.receta = receta([linea(cebolla, 100)], 100);
  // Salsa con stock: 1000 g de tomate y 100 g de aderezo rinden 1000 g.
  const salsa = intermedio('salsa');
  salsa.llevaStock = true;
  salsa.receta = receta([linea(tomate, 1000), linea(aderezo, 100)], 1000);
  // Base sin stock que contiene la salsa y cebolla.
  const base = intermedio('base');
  base.receta = receta([linea(salsa, 300), linea(cebolla, 50)], 1);

  it('tieneStock: insumos e intermedios con la marca', () => {
    expect(tieneStock(tomate)).toBe(true);
    expect(tieneStock(salsa)).toBe(true);
    expect(tieneStock(aderezo)).toBe(false);
  });

  it('se detiene en un intermedio con stock', () => {
    const plato = receta([linea(salsa, 200)]);
    expect(insumosNecesarios(plato, 1)).toEqual(new Map([[salsa.id, 200]]));
  });

  it('explota un intermedio sin stock y se detiene en la salsa que contiene', () => {
    const plato = receta([linea(base, 1)]);
    const res = insumosNecesarios(plato, 2);
    expect([...res.keys()].sort()).toEqual([cebolla.id, salsa.id].sort());
    expect(res.get(salsa.id)).toBeCloseTo(600);
    expect(res.get(cebolla.id)).toBeCloseTo(100);
  });

  it('un intermedio con stock que contiene otro sin stock: la tanda consume los insumos del de adentro', () => {
    const res = insumosNecesarios(salsa.receta!, 500);
    expect([...res.keys()].sort()).toEqual([cebolla.id, tomate.id].sort());
    expect(res.get(tomate.id)).toBeCloseTo(500);
    expect(res.get(cebolla.id)).toBeCloseTo(50);
  });

  it('costoUnitario con stock usa el costo vigente; sin él, el teórico', () => {
    // Teórico: (1000 × 0,002 + 100 × 0,001) ÷ 1000 = 0,0021 (el aderezo cuesta 0,001 por g).
    salsa.costoCompraVigente = 0.003;
    expect(costoUnitario(salsa)).toBe(0.003);
    salsa.costoCompraVigente = null;
    expect(costoUnitario(salsa)).toBeCloseTo(0.0021);
  });

  it('costoUnitario sin stock es el teórico aunque tenga costo vigente', () => {
    aderezo.costoCompraVigente = 9;
    expect(costoUnitario(aderezo)).toBeCloseTo(0.001);
    aderezo.costoCompraVigente = null;
  });
});
