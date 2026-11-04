import type { Componente, Receta } from './receta';
import {
  crearVerificadorMesas,
  crearVerificadorStock,
  type PronosticoAVerificar,
} from './verificadores';

const insumo = (id: string, nombre: string, extra: Partial<Componente> = {}): Componente => ({
  id,
  nombre,
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 1,
  llevaStock: false,
  receta: null,
  ...extra,
});

const receta = (lineas: [Componente, number][], rendimiento = 1): Receta => ({
  lineas: lineas.map(([componente, cantidad]) => ({
    componente,
    cantidad,
    unidad: 'GRAMO',
    porcentajeMerma: 0,
  })),
  rendimiento,
  instrucciones: null,
});

// 2026-11-09 es lunes.
const pron = (
  id: string,
  fecha: string,
  franja: 'ALMUERZO' | 'CENA',
  demanda: { itemMenuId: string; cantidad: number }[],
  cubiertosEstimados = 10,
): PronosticoAVerificar => ({ id, fecha, franja, cubiertosEstimados, demanda });

const harina = insumo('h', 'Harina');
const stock = (cantidad: number) => ({
  existenciaId: 'e-h',
  nombre: 'Harina',
  unidad: 'g',
  cantidad,
});

describe('verificador de stock', () => {
  const recetas = new Map([['pizza', receta([[harina, 100]])]]);
  const semanaDesde = '2026-11-09';

  it('alerta en la primera franja donde lo acumulado supera el stock, una sola vez', () => {
    const v = crearVerificadorStock({
      semanaDesde,
      recetas,
      existencias: new Map([['h', stock(250)]]),
    });
    const alertas = v.verificar([
      pron('p1', '2026-11-09', 'ALMUERZO', [{ itemMenuId: 'pizza', cantidad: 2 }]),
      pron('p2', '2026-11-09', 'CENA', [{ itemMenuId: 'pizza', cantidad: 2 }]),
      pron('p3', '2026-11-13', 'CENA', [{ itemMenuId: 'pizza', cantidad: 2.5 }]),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tipo: 'FALTANTE_STOCK_PREVISTO',
      pronosticoId: 'p2',
      existenciaId: 'e-h',
      franja: 'CENA',
      fecha: '2026-11-09',
      arquetipo: null,
      cantidad: 400, // 650 de consumo semanal menos 250 de stock
    });
  });

  it('severidad CRITICA en los dos primeros días y ADVERTENCIA después', () => {
    const existencias = new Map([['h', stock(0)]]);
    const v = crearVerificadorStock({ semanaDesde, recetas, existencias });
    const demanda = [{ itemMenuId: 'pizza', cantidad: 1 }];
    expect(v.verificar([pron('p', '2026-11-10', 'CENA', demanda)])[0]!.severidad).toBe('CRITICA');
    expect(v.verificar([pron('p', '2026-11-11', 'ALMUERZO', demanda)])[0]!.severidad).toBe(
      'ADVERTENCIA',
    );
  });

  it('un intermedio con stock se descuenta a sí mismo y no a sus insumos', () => {
    const salsa = insumo('s', 'Salsa', {
      tipo: 'INTERMEDIO',
      llevaStock: true,
      receta: receta([[harina, 50]]),
    });
    const v = crearVerificadorStock({
      semanaDesde,
      recetas: new Map([['pasta', receta([[salsa, 30]])]]),
      existencias: new Map([
        ['s', { existenciaId: 'e-s', nombre: 'Salsa', unidad: 'g', cantidad: 10 }],
        ['h', stock(0)],
      ]),
    });
    const alertas = v.verificar([
      pron('p', '2026-11-09', 'CENA', [{ itemMenuId: 'pasta', cantidad: 1 }]),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ existenciaId: 'e-s', cantidad: 20 });
  });

  it('con stock suficiente devuelve []', () => {
    const v = crearVerificadorStock({
      semanaDesde,
      recetas,
      existencias: new Map([['h', stock(1000)]]),
    });
    expect(
      v.verificar([pron('p', '2026-11-09', 'CENA', [{ itemMenuId: 'pizza', cantidad: 2 }])]),
    ).toEqual([]);
  });

  it('un componente sin Existencia cuenta como stock 0 y lleva su nombre', () => {
    const v = crearVerificadorStock({ semanaDesde, recetas, existencias: new Map() });
    const [alerta] = v.verificar([
      pron('p', '2026-11-12', 'CENA', [{ itemMenuId: 'pizza', cantidad: 1 }]),
    ]);
    expect(alerta).toMatchObject({ existenciaId: null, cantidad: 100 });
    expect(alerta!.descripcion).toContain('Harina');
    expect(alerta!.descripcion).toContain('jueves a la noche');
  });

  it('un plato sin receta no aporta consumo ni lanza error', () => {
    const v = crearVerificadorStock({
      semanaDesde,
      recetas,
      existencias: new Map([['h', stock(1000)]]),
    });
    expect(
      v.verificar([pron('p', '2026-11-09', 'CENA', [{ itemMenuId: 'huerfano', cantidad: 5 }])]),
    ).toEqual([]);
  });

  it('redondea el faltante hacia arriba', () => {
    const v = crearVerificadorStock({
      semanaDesde,
      recetas,
      existencias: new Map([['h', stock(0)]]),
    });
    const [alerta] = v.verificar([
      pron('p', '2026-11-09', 'CENA', [{ itemMenuId: 'pizza', cantidad: 1.005 }]),
    ]);
    expect(alerta!.cantidad).toBe(101);
  });
});

describe('verificador de mesas', () => {
  const horasPorFranja = new Map<'ALMUERZO' | 'CENA', number>([
    ['ALMUERZO', 3],
    ['CENA', 4],
  ]);
  const ctx = (capacidadMesas: number[], reservados = new Map<string, number>()) =>
    crearVerificadorMesas({ capacidadMesas, horasPorFranja, reservados });

  it('alerta si los estimados superan la capacidad', () => {
    // capacidad 10 * 3 = 30; estimados 35.
    const [alerta] = ctx([4, 6]).verificar([pron('p', '2026-11-14', 'ALMUERZO', [], 35)]);
    expect(alerta).toMatchObject({
      tipo: 'CAPACIDAD_MESAS',
      severidad: 'ADVERTENCIA',
      cantidad: 5,
      pronosticoId: 'p',
      existenciaId: null,
      arquetipo: null,
    });
  });

  it('usa las reservas tomadas si son más que los estimados', () => {
    const v = ctx([10], new Map([['2026-11-14|CENA', 50]]));
    const [alerta] = v.verificar([pron('p', '2026-11-14', 'CENA', [], 20)]);
    expect(alerta!.cantidad).toBe(10);
  });

  it('justo en la capacidad no alerta', () => {
    expect(ctx([10]).verificar([pron('p', '2026-11-14', 'CENA', [], 40)])).toEqual([]);
  });

  it('0 cubiertos y 0 mesas no alerta', () => {
    expect(ctx([]).verificar([pron('p', '2026-11-14', 'CENA', [], 0)])).toEqual([]);
  });
});
