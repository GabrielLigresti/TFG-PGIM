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
  costoCompraVigente: 0.01,
  llevaStock: false,
  receta: null,
};

const SALSA = '01900000-0000-7000-8000-0000000000b1';

const salsa = (parcial: Partial<Componente> = {}): Componente => ({
  id: SALSA,
  nombre: 'Salsa de tomate base',
  tipo: 'INTERMEDIO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: null,
  llevaStock: false,
  receta: {
    rendimiento: 100,
    instrucciones: null,
    lineas: [{ componente: carne, cantidad: 200, unidad: 'GRAMO', porcentajeMerma: 0 }],
  },
  ...parcial,
});

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
    cambiarLlevaStock: jest.fn(),
    existenciasConStock: jest.fn().mockResolvedValue([]),
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

  it('no da de baja un intermedio con existencia en alguna sucursal', async () => {
    const repo = repoFalso(false);
    repo.cargarCatalogo.mockResolvedValue(new Map([[SALSA, salsa()]]));
    repo.existenciasConStock.mockResolvedValue([
      { sucursal: 'Centro', cantidad: 2 },
      { sucursal: 'Palermo', cantidad: 1 },
    ]);

    await expect(createRecetaService(repo).desactivarIntermedio(R, SALSA)).rejects.toMatchObject({
      status: 409,
      message:
        'Ajustá a cero el stock de Salsa de tomate base en Centro, Palermo antes de darlo de baja',
    });
    expect(repo.desactivarIntermedio).not.toHaveBeenCalled();
  });

  describe('cambiarLlevaStock', () => {
    function conSalsa(parcial: Partial<Componente> = {}) {
      const repo = repoFalso(false);
      repo.cargarCatalogo.mockResolvedValue(
        new Map([
          [CARNE, carne],
          [SALSA, salsa(parcial)],
        ]),
      );
      return { repo, service: createRecetaService(repo) };
    }

    it('no activa un intermedio sin receta', async () => {
      const { repo, service } = conSalsa({ receta: null });

      await expect(service.cambiarLlevaStock(R, SALSA, true)).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.cambiarLlevaStock).not.toHaveBeenCalled();
    });

    it('no activa un intermedio dado de baja', async () => {
      const { repo, service } = conSalsa({ activo: false });

      await expect(service.cambiarLlevaStock(R, SALSA, true)).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.cambiarLlevaStock).not.toHaveBeenCalled();
    });

    it('al activar guarda el costo teórico de la receta como costo vigente', async () => {
      const { repo, service } = conSalsa();

      await service.cambiarLlevaStock(R, SALSA, true);

      // 200 g de carne a 0,01 por 100 g de rendimiento.
      expect(repo.cambiarLlevaStock).toHaveBeenCalledWith(R, SALSA, true, 0.02);
    });

    it('no desactiva con existencia en una sucursal', async () => {
      const { repo, service } = conSalsa({ llevaStock: true });
      repo.existenciasConStock.mockResolvedValue([{ sucursal: 'Centro', cantidad: 3 }]);

      await expect(service.cambiarLlevaStock(R, SALSA, false)).rejects.toMatchObject({
        status: 409,
        message: 'Ajustá a cero el stock de Salsa de tomate base en Centro antes de desactivarlo',
      });
      expect(repo.cambiarLlevaStock).not.toHaveBeenCalled();
    });

    it('desactiva con todo en cero y limpia el costo vigente', async () => {
      const { repo, service } = conSalsa({ llevaStock: true });

      await service.cambiarLlevaStock(R, SALSA, false);

      expect(repo.cambiarLlevaStock).toHaveBeenCalledWith(R, SALSA, false, null);
    });

    it('repetir la marca actual no hace nada', async () => {
      const { repo, service } = conSalsa({ llevaStock: true });

      await service.cambiarLlevaStock(R, SALSA, true);

      expect(repo.cambiarLlevaStock).not.toHaveBeenCalled();
      expect(repo.existenciasConStock).not.toHaveBeenCalled();
    });
  });
});
