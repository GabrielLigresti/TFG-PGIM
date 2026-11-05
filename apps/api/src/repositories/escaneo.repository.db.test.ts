import type { InformeCalidad } from '@pgim/shared';
import { esClaveDuplicada } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { escaneoRepository as repo } from './escaneo.repository';

afterAll(() => prisma.$disconnect());

const calidad: InformeCalidad = {
  version: 1,
  nivelGlobal: 'OK',
  metadatos: { ancho: 1920, alto: 1080, duracionS: 30 },
  criterios: [],
};

describe('escaneo de platos', () => {
  let e: Escenario;
  let empleadoId: string;

  const nuevo = (parcial: object = {}) =>
    repo.crear({
      restauranteId: e.restauranteId,
      itemMenuId: e.pizzaId,
      empleadoId,
      proveedor: 'simulado',
      rutaVideo: '/tmp/video.mp4',
      calidad,
      ...parcial,
    });

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const rol = await prisma.rol.create({
      data: { restauranteId: e.restauranteId, nombre: 'Encargado', arquetipo: 'OTRO' },
    });
    const usuario = await prisma.usuario.create({
      data: {
        email: `encargado-${Date.now()}@prueba.test`,
        passwordHash: 'x',
        tipo: 'EMPLEADO',
        empleado: {
          create: {
            restauranteId: e.restauranteId,
            rolId: rol.id,
            nombreCompleto: 'Encargado de prueba',
            horasSemanalesMax: 40,
          },
        },
      },
    });
    empleadoId = usuario.id;
  });

  it('crea el escaneo PENDIENTE y guarda el informe', async () => {
    const fila = await nuevo();
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.calidad).toEqual(calidad);
    expect(await repo.ultimoDelPlato(e.restauranteId, e.pizzaId)).toMatchObject({ id: fila.id });
  });

  it('el índice parcial impide un segundo escaneo activo del mismo plato', async () => {
    await nuevo();
    const error = await nuevo().catch((err) => err);
    expect(esClaveDuplicada(error)).toBe(true);
  });

  it('permite uno nuevo si el anterior es FALLIDO', async () => {
    const primero = await nuevo();
    await repo.cambiarEstado(e.restauranteId, primero.id, 'PENDIENTE', {
      estado: 'FALLIDO',
      error: 'x',
    });
    const segundo = await nuevo();
    expect((await repo.ultimoDelPlato(e.restauranteId, e.pizzaId))?.id).toBe(segundo.id);
  });

  it('buscar de otro restaurante da null', async () => {
    const fila = await nuevo();
    expect(await repo.buscar(e.restauranteId, fila.id)).not.toBeNull();
    expect(await repo.buscar('00000000-0000-7000-8000-000000000000', fila.id)).toBeNull();
  });

  it('cambiarEstado con un estado de origen desactualizado devuelve false', async () => {
    const fila = await nuevo();
    expect(
      await repo.cambiarEstado(e.restauranteId, fila.id, 'PROCESANDO', { estado: 'FALLIDO' }),
    ).toBe(false);
    expect(
      await repo.cambiarEstado(e.restauranteId, fila.id, 'PENDIENTE', {
        estado: 'PROCESANDO',
        tareaProveedorId: 't1',
      }),
    ).toBe(true);
    expect((await repo.buscar(e.restauranteId, fila.id))?.tareaProveedorId).toBe('t1');
  });

  it('cambiarEstado de otro restaurante no cambia nada', async () => {
    const fila = await nuevo();
    expect(
      await repo.cambiarEstado('00000000-0000-7000-8000-000000000000', fila.id, 'PENDIENTE', {
        estado: 'FALLIDO',
      }),
    ).toBe(false);
  });

  it('enCurso trae PENDIENTE y PROCESANDO, no los de revisión', async () => {
    const otro = await prisma.itemMenu.findFirstOrThrow({ where: { id: e.aguaId } });
    const a = await nuevo();
    const b = await nuevo({ itemMenuId: otro.id });
    await repo.cambiarEstado(e.restauranteId, b.id, 'PENDIENTE', { estado: 'PROCESANDO' });
    expect((await repo.enCurso()).map((f) => f.id)).toEqual([a.id, b.id]);
    await repo.cambiarEstado(e.restauranteId, b.id, 'PROCESANDO', {
      estado: 'EN_REVISION',
      urlModelo: '/m.glb',
    });
    expect((await repo.enCurso()).map((f) => f.id)).toEqual([a.id]);
  });

  describe('publicar', () => {
    const datos = { escalaReal: 1.5, porcionGramos: 300 };

    const enRevision = async (urlModelo: string, urlModeloIos?: string) => {
      const fila = await nuevo();
      await repo.cambiarEstado(e.restauranteId, fila.id, 'PENDIENTE', {
        estado: 'EN_REVISION',
        urlModelo,
        urlModeloIos,
      });
      return fila;
    };

    it('crea el modelo y marca el escaneo PUBLICADO', async () => {
      const fila = await enRevision('/nuevo.glb', '/nuevo.usdz');
      expect(await repo.publicar(e.restauranteId, fila.id, datos)).toEqual({ anterior: null });
      const modelo = await prisma.modeloRA.findUniqueOrThrow({ where: { itemMenuId: e.pizzaId } });
      expect(modelo).toMatchObject({ urlModelo: '/nuevo.glb', urlModeloIos: '/nuevo.usdz' });
      expect(Number(modelo.escalaReal)).toBe(1.5);
      expect((await repo.buscar(e.restauranteId, fila.id))?.estado).toBe('PUBLICADO');
    });

    it('reemplaza el modelo anterior, lo devuelve y deja urlModeloIos null si no hay', async () => {
      await prisma.modeloRA.create({
        data: {
          itemMenuId: e.pizzaId,
          urlModelo: '/viejo.glb',
          urlModeloIos: '/viejo.usdz',
          escalaReal: 1,
          porcionGramos: 200,
        },
      });
      const fila = await enRevision('/nuevo.glb');
      const res = await repo.publicar(e.restauranteId, fila.id, datos);
      expect(res?.anterior).toEqual({
        urlModelo: '/viejo.glb',
        urlModeloIos: '/viejo.usdz',
        escalaReal: 1,
        porcionGramos: 200,
      });
      const modelo = await prisma.modeloRA.findUniqueOrThrow({ where: { itemMenuId: e.pizzaId } });
      expect(modelo).toMatchObject({ urlModelo: '/nuevo.glb', urlModeloIos: null });
    });

    it('devuelve null si el escaneo ya no estaba EN_REVISION y no toca el modelo', async () => {
      const fila = await nuevo();
      expect(await repo.publicar(e.restauranteId, fila.id, datos)).toBeNull();
      expect(await prisma.modeloRA.count()).toBe(0);
    });

    it('devuelve null con otro restaurante', async () => {
      const fila = await enRevision('/nuevo.glb');
      expect(
        await repo.publicar('00000000-0000-7000-8000-000000000000', fila.id, datos),
      ).toBeNull();
      expect((await repo.buscar(e.restauranteId, fila.id))?.estado).toBe('EN_REVISION');
    });
  });
});
