import type { Componente } from '../domain/receta';
import type { Catalogo, PlatoConReceta, RecetaRepository } from '../repositories/receta.repository';
import { createRecetaService } from './receta.service';

const R = 'restaurante';
const CARNE = '01900000-0000-7000-8000-0000000000a1';

const carne: Componente = {
  id: CARNE,
  nombre: 'Carne',
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompra: 0.01,
  receta: null,
};

const plato = (conReceta: boolean): PlatoConReceta => ({
  id: 'bife',
  nombre: 'Bife',
  activo: true,
  categoria: 'Principales',
  receta: conReceta
    ? {
        rendimiento: 1,
        instrucciones: null,
        lineas: [{ componenteId: CARNE, cantidad: 300, unidad: 'GRAMO', porcentajeMerma: 0 }],
      }
    : null,
});

function repoFalso(conReceta: boolean): jest.Mocked<RecetaRepository> {
  const catalogo: Catalogo = new Map([[CARNE, carne]]);
  return {
    cargarCatalogo: jest.fn().mockResolvedValue(catalogo),
    listarPlatos: jest.fn().mockResolvedValue([plato(conReceta)]),
    buscarPlato: jest.fn().mockResolvedValue(plato(conReceta)),
    guardarRecetaPlato: jest.fn(),
    guardarRecetaIntermedio: jest.fn(),
    crearIntermedio: jest.fn(),
    borrarRecetaPlato: jest.fn(),
    desactivarIntermedio: jest.fn(),
    existeNombre: jest.fn().mockResolvedValue(false),
    usosDeComponente: jest.fn().mockResolvedValue([]),
  };
}

const datos = {
  lineas: [
    { componenteId: CARNE, cantidad: 0.4, unidad: 'KILOGRAMO' as const, porcentajeMerma: 20 },
  ],
  rendimiento: 2,
};

describe('recetaService', () => {
  it('la primera receta de un plato pide receta.crear', async () => {
    const repo = repoFalso(false);
    const service = createRecetaService(repo);

    await expect(service.guardarDePlato(R, 'bife', datos, ['receta.editar'])).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    await service.guardarDePlato(R, 'bife', datos, ['receta.crear']);
    expect(repo.guardarRecetaPlato).toHaveBeenCalled();
  });

  it('reemplazar una receta existente pide receta.editar', async () => {
    const service = createRecetaService(repoFalso(true));

    await expect(service.guardarDePlato(R, 'bife', datos, ['receta.crear'])).rejects.toMatchObject({
      status: 403,
    });
  });

  it('devuelve los errores del builder por línea con status 400', async () => {
    const service = createRecetaService(repoFalso(false));
    const invalida = { ...datos, lineas: [{ ...datos.lineas[0]!, unidad: 'LITRO' as const }] };

    await expect(
      service.guardarDePlato(R, 'bife', invalida, ['receta.crear']),
    ).rejects.toMatchObject({
      status: 400,
      detalles: [{ linea: 0, mensaje: expect.stringContaining('se mide en g') }],
    });
  });

  it('calcula el costo total y por porción del detalle', async () => {
    const detalle = await createRecetaService(repoFalso(true)).obtenerDePlato(R, 'bife');

    expect(detalle.receta?.costoTotal).toBeCloseTo(3);
    expect(detalle.receta?.costoPorPorcion).toBeCloseTo(3);
  });

  it('no da de baja un intermedio que se usa en otra receta', async () => {
    const repo = repoFalso(false);
    const salsa: Componente = { ...carne, id: 'salsa', nombre: 'Salsa', tipo: 'INTERMEDIO' };
    repo.cargarCatalogo.mockResolvedValue(new Map([['salsa', salsa]]));
    repo.usosDeComponente.mockResolvedValue(['Bife']);

    await expect(createRecetaService(repo).desactivarIntermedio(R, 'salsa')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Bife'),
    });
  });
});
