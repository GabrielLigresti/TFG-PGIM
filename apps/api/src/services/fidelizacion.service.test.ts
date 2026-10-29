import type { BeneficioInput } from '@pgim/shared';
import type {
  FidelizacionRepository,
  FilaBeneficio,
} from '../repositories/fidelizacion.repository';
import { createFidelizacionService } from './fidelizacion.service';

const R = 'rest-1';
const AHORA = new Date('2026-11-10T12:00:00Z');

const fila = (d: Partial<FilaBeneficio> = {}): FilaBeneficio => ({
  id: 'b1',
  nombre: 'Postre de regalo',
  clase: 'RECOMPENSA',
  criterioTipo: 'VISITAS',
  criterioValor: 3,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
  vigenciaHasta: new Date('2026-11-30T00:00:00Z'),
  stockInicial: 5,
  stockDisponible: 5,
  activo: true,
  grupo: null,
  menu: null,
  pagosEnCurso: 0,
  ...d,
});

const input: BeneficioInput = {
  nombre: 'Postre de regalo',
  clase: 'RECOMPENSA',
  criterioTipo: 'VISITAS',
  criterioValor: 3,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: '2026-12-01T00:00:00Z',
  vigenciaHasta: '2026-12-31T00:00:00Z',
  stockInicial: 5,
};

function repoFalso(b: FilaBeneficio | null = fila()): jest.Mocked<FidelizacionRepository> {
  return {
    programa: jest.fn().mockResolvedValue(null),
    crearPrograma: jest.fn().mockResolvedValue(true),
    grupos: jest.fn().mockResolvedValue([]),
    existeGrupo: jest.fn().mockResolvedValue(true),
    crearGrupo: jest.fn(),
    editarGrupo: jest.fn(),
    borrarGrupo: jest.fn().mockResolvedValue('BORRADO'),
    existeMenu: jest.fn().mockResolvedValue(true),
    beneficios: jest.fn().mockResolvedValue(b ? [b] : []),
    beneficio: jest.fn().mockResolvedValue(b),
    crearBeneficio: jest
      .fn()
      .mockImplementation(async (_r, d) => fila({ ...d, stockDisponible: d.stockInicial })),
    editarBeneficio: jest.fn().mockImplementation(async (_r, _id, _d, puede) => puede(b!)),
    relanzarBeneficio: jest.fn().mockImplementation(async (_r, _id, nueva) => nueva(b!) !== null),
    darDeBajaBeneficio: jest.fn().mockImplementation(async (_r, _id, puede) => puede(b!)),
  };
}

const servicio = (repo: FidelizacionRepository) => createFidelizacionService(repo, () => AHORA);

describe('programa de puntos', () => {
  it('se crea una sola vez', async () => {
    const repo = repoFalso();
    repo.crearPrograma.mockResolvedValue(false);
    await expect(servicio(repo).crearPrograma(R, { puntosPorUnidad: 0.01 })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('beneficios', () => {
  it('lista con el estado calculado', async () => {
    const [b] = await servicio(repoFalso()).beneficios(R, {});
    expect(b).toMatchObject({ estado: 'VIGENTE', vigenciaDesde: '2026-11-01T00:00:00.000Z' });
  });

  it('una promoción con un menú de otro restaurante responde 404', async () => {
    const repo = repoFalso();
    repo.existeMenu.mockResolvedValue(false);
    await expect(
      servicio(repo).crearBeneficio(R, {
        ...input,
        clase: 'PROMOCION',
        menuId: '01900000-0000-7000-8000-000000000001',
        criterioTipo: null,
        criterioValor: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('nuevo cliente guarda criterio_valor 1 (lo exige el DER)', async () => {
    const repo = repoFalso();
    await servicio(repo).crearBeneficio(R, {
      ...input,
      criterioTipo: 'NUEVO_CLIENTE',
      criterioValor: null,
    });
    expect(repo.crearBeneficio).toHaveBeenCalledWith(
      R,
      expect.objectContaining({ criterioTipo: 'NUEVO_CLIENTE', criterioValor: 1 }),
    );
  });

  it('la promoción no guarda criterio y la recompensa no guarda menú', async () => {
    const repo = repoFalso();
    await servicio(repo).crearBeneficio(R, {
      ...input,
      menuId: '01900000-0000-7000-8000-000000000001',
    });
    expect(repo.crearBeneficio).toHaveBeenCalledWith(R, expect.objectContaining({ menuId: null }));
  });

  it('no se edita un beneficio vigente', async () => {
    await expect(servicio(repoFalso()).editarBeneficio(R, 'b1', input)).rejects.toMatchObject({
      status: 409,
      message: 'No se puede editar un beneficio vigente',
    });
  });

  it('un beneficio programado se edita', async () => {
    const repo = repoFalso(
      fila({ vigenciaDesde: new Date('2026-11-20'), vigenciaHasta: new Date('2026-12-20') }),
    );
    await servicio(repo).editarBeneficio(R, 'b1', input);
    expect(repo.editarBeneficio).toHaveBeenCalled();
  });

  it('no se relanza con pagos en curso', async () => {
    const repo = repoFalso(fila({ stockDisponible: 0, pagosEnCurso: 1 }));
    await expect(servicio(repo).relanzarBeneficio(R, 'b1')).rejects.toMatchObject({ status: 409 });
    expect(repo.relanzarBeneficio).not.toHaveBeenCalled();
  });

  it('relanza uno terminado con la vigencia y el stock de relanzar()', async () => {
    const terminado = fila({ stockDisponible: 0 });
    const repo = repoFalso(terminado);
    await servicio(repo).relanzarBeneficio(R, 'b1');
    const nueva = repo.relanzarBeneficio.mock.calls[0]![2];
    expect(nueva(terminado)).toEqual({
      vigenciaDesde: AHORA,
      vigenciaHasta: new Date('2026-12-09T12:00:00Z'),
      stockDisponible: 5,
    });
    expect(nueva({ ...terminado, pagosEnCurso: 1 })).toBeNull();
  });

  it('no se da de baja uno vigente', async () => {
    await expect(servicio(repoFalso()).darDeBajaBeneficio(R, 'b1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('un beneficio de otro restaurante responde 404', async () => {
    await expect(servicio(repoFalso(null)).relanzarBeneficio(R, 'b1')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('grupos', () => {
  it('no se borra un grupo con beneficios', async () => {
    const repo = repoFalso();
    repo.borrarGrupo.mockResolvedValue('CON_BENEFICIOS');
    await expect(servicio(repo).borrarGrupo(R, 'g1')).rejects.toMatchObject({ status: 409 });
  });
});
