import {
  RecetaBuilder,
  RecetaInvalidaError,
  cantidadBruta,
  contiene,
  costoTotal,
  costoUnitario,
  type Componente,
} from './receta';

function insumo(id: string, unidadBase: Componente['unidadBase'], costoCompra: number): Componente {
  return { id, nombre: id, tipo: 'INSUMO', unidadBase, activo: true, costoCompra, receta: null };
}

function intermedio(id: string, unidadBase: Componente['unidadBase'] = 'GRAMO'): Componente {
  return {
    id,
    nombre: id,
    tipo: 'INTERMEDIO',
    unidadBase,
    activo: true,
    costoCompra: null,
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
