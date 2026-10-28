import type { ElegibilidadBeneficio } from '../repositories/elegibilidad';
import type { FilaBeneficio } from '../repositories/fidelizacion.repository';
import {
  clasificarBeneficios,
  createBeneficiosComensalService,
  type BeneficiosComensalRepository,
} from './beneficios-comensal.service';

const AHORA = new Date('2026-11-10T12:00:00Z');
const MENU = 'menu-activo';

const fila = (d: Partial<FilaBeneficio>): FilaBeneficio => ({
  id: 'b',
  nombre: 'Beneficio',
  clase: 'RECOMPENSA',
  criterioTipo: 'VISITAS',
  criterioValor: 3,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
  vigenciaHasta: new Date('2026-11-30T00:00:00Z'),
  stockInicial: null,
  stockDisponible: null,
  activo: true,
  grupo: null,
  menu: null,
  pagosEnCurso: 0,
  ...d,
});

const promo = fila({
  id: 'promo',
  nombre: '2x1',
  clase: 'PROMOCION',
  criterioTipo: null,
  criterioValor: null,
  valor: 50,
  menu: { id: MENU, nombre: 'Carta' },
});
const tresVisitas = fila({
  id: 'tres',
  nombre: 'Postre de regalo',
  tipoDescuento: 'MONTO_FIJO',
  valor: 3000,
});
const cincoVisitas = fila({ id: 'cinco', nombre: 'Café', criterioValor: 5 });

const eleg = (d: Partial<ElegibilidadBeneficio['datos']> = {}, canjeadoEnEdicion = false) => ({
  datos: { visitas: 3, montoGastado: 0, puntos: 0, tienePagosAprobados: true, ...d },
  canjeadoEnEdicion,
});

describe('clasificarBeneficios', () => {
  const clasificar = (
    beneficios: FilaBeneficio[],
    porBeneficio: Map<string, ElegibilidadBeneficio>,
  ) => clasificarBeneficios(beneficios, porBeneficio, { menuActivoId: MENU, saldo: 20000 }, AHORA);

  it('ofrece la promoción del menú activo y la recompensa alcanzada, con el descuento calculado', () => {
    const r = clasificar(
      [promo, tresVisitas],
      new Map([
        ['promo', eleg()],
        ['tres', eleg({ visitas: 3 })],
      ]),
    );
    expect(r.disponibles).toEqual([
      { id: 'promo', nombre: '2x1', descripcion: '50 % de descuento', descuento: 10000 },
      {
        id: 'tres',
        nombre: 'Postre de regalo',
        descripcion: expect.stringMatching(/3\.000.*de descuento/),
        descuento: 3000,
      },
    ]);
    expect(r.noAlcanzados).toEqual([]);
  });

  it('muestra el progreso de lo que falta', () => {
    const r = clasificar([cincoVisitas], new Map([['cinco', eleg({ visitas: 3 })]]));
    expect(r.disponibles).toEqual([]);
    expect(r.noAlcanzados).toEqual([
      {
        id: 'cinco',
        nombre: 'Café',
        descripcion: '10 % de descuento',
        progreso: { actual: 3, requerido: 5, unidad: 'visitas' },
      },
    ]);
  });

  it('no ofrece una promoción de otro menú', () => {
    const otra = { ...promo, menu: { id: 'otro', nombre: 'Invierno' } };
    expect(clasificar([otra], new Map([['promo', eleg()]])).disponibles).toEqual([]);
  });

  it('no ofrece un beneficio agotado ni uno que todavía no empezó', () => {
    const agotado = { ...promo, stockInicial: 5, stockDisponible: 0 };
    const programado = { ...tresVisitas, vigenciaDesde: new Date('2026-11-20T00:00:00Z') };
    const r = clasificar(
      [agotado, programado],
      new Map([
        ['promo', eleg()],
        ['tres', eleg()],
      ]),
    );
    expect(r).toEqual({ disponibles: [], noAlcanzados: [] });
  });

  it('una recompensa por puntos canjeada en esta edición no se vuelve a ofrecer', () => {
    const puntos = fila({ id: 'pts', criterioTipo: 'PUNTOS', criterioValor: 300 });
    const r = clasificar([puntos], new Map([['pts', eleg({ puntos: 900 }, true)]]));
    expect(r).toEqual({ disponibles: [], noAlcanzados: [] });
  });

  it('una recompensa por visitas ya canjeada vuelve a contar desde el canje', () => {
    // El repositorio ya contó desde el canje: 4 de 5.
    const r = clasificar([cincoVisitas], new Map([['cinco', eleg({ visitas: 4 }, true)]]));
    expect(r.noAlcanzados[0]!.progreso).toEqual({ actual: 4, requerido: 5, unidad: 'visitas' });
  });
});

describe('servicio de beneficios del comensal', () => {
  function repoFalso(): jest.Mocked<BeneficiosComensalRepository> {
    return {
      contextoMesa: jest.fn().mockResolvedValue({
        restauranteId: 'r',
        menuActivoId: MENU,
        saldo: 20000,
        beneficioUsado: false,
      }),
      beneficiosActivos: jest.fn().mockResolvedValue([promo, tresVisitas]),
      elegibilidad: jest.fn().mockResolvedValue({
        puntos: 0,
        porBeneficio: new Map([
          ['promo', eleg()],
          ['tres', eleg()],
        ]),
      }),
      cuentasDelComensal: jest.fn().mockResolvedValue([]),
    };
  }

  it('la mesa de otro comensal responde 404', async () => {
    const repo = repoFalso();
    repo.contextoMesa.mockResolvedValue(null);
    await expect(
      createBeneficiosComensalService(repo, () => AHORA).deMesa('c', 'cm'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('si la mesa ya usó un beneficio no ofrece ninguno', async () => {
    const repo = repoFalso();
    repo.contextoMesa.mockResolvedValue({
      restauranteId: 'r',
      menuActivoId: MENU,
      saldo: 20000,
      beneficioUsado: true,
    });
    const r = await createBeneficiosComensalService(repo, () => AHORA).deMesa('c', 'cm');
    expect(r.disponibles).toEqual([]);
    expect(r.beneficioUsado).toBe(true);
  });

  it('"Mis puntos" vacío si el comensal no tiene cuentas', async () => {
    expect(await createBeneficiosComensalService(repoFalso(), () => AHORA).fidelidad('c')).toEqual(
      [],
    );
  });

  it('"Mis puntos" marca las recompensas alcanzadas', async () => {
    const repo = repoFalso();
    repo.cuentasDelComensal.mockResolvedValue([
      { restaurante: { id: 'r', nombre: 'La Parrilla' }, puntos: 120, visitas: 3, programa: true },
    ]);
    repo.beneficiosActivos.mockResolvedValue([promo, tresVisitas, cincoVisitas]);
    repo.elegibilidad.mockResolvedValue({
      puntos: 120,
      porBeneficio: new Map([
        ['tres', eleg({ visitas: 3 })],
        ['cinco', eleg({ visitas: 3 })],
      ]),
    });
    const [tarjeta] = await createBeneficiosComensalService(repo, () => AHORA).fidelidad('c');
    expect(tarjeta).toMatchObject({ puntos: 120, visitas: 3, programa: true });
    expect(tarjeta!.recompensas.map((r) => [r.nombre, r.alcanzada])).toEqual([
      ['Postre de regalo', true],
      ['Café', false],
    ]);
  });
});
