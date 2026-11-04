import type { Prisma } from '../generated/prisma/client';
import type { FilaPronostico } from '../domain/pronostico';
import { crearVerificadorStock, type AlertaNueva } from '../domain/verificadores';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { aperturaRepository } from './apertura.repository';
import {
  planificacionRepository,
  type FasesPlanificacion,
  type ResultadoPlanificacion,
} from './planificacion.repository';
import { createAperturaService } from '../services/apertura.service';

afterAll(() => prisma.$disconnect());

const SEMANA = '2026-11-09'; // lunes
const AHORA = new Date('2026-11-04T15:00:00Z');
const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

const fila = (
  fecha: string,
  franja: 'ALMUERZO' | 'CENA',
  demanda: FilaPronostico['demanda'] = [],
  cubiertos = 10,
): FilaPronostico => ({
  fecha,
  franja,
  cubiertosEstimados: cubiertos,
  limiteInferior: 8,
  limiteSuperior: 12,
  ingresoEstimado: 1234.5,
  metodo: 'NAIVE_ESTACIONAL',
  errorMape: 12.34,
  demanda,
});

const vacio: ResultadoPlanificacion = { alertas: [], turnos: [] };

// Fases que guardan las filas y planifican con lo que devuelve `resultado`.
const fases = (
  filas: FilaPronostico[],
  resultado: (
    pronosticos: { id: string; fecha: string; franja: string }[],
  ) => ResultadoPlanificacion = () => vacio,
): jest.Mocked<FasesPlanificacion> => ({
  pronosticar: jest.fn(async (_tx: Prisma.TransactionClient) => ({ suficiente: true, filas })),
  planificar: jest.fn(async (_tx, pronosticos) => resultado(pronosticos)),
});

const alertaSobre = (id: string | null, fecha: string): AlertaNueva => ({
  tipo: 'CAPACIDAD_MESAS',
  severidad: 'ADVERTENCIA',
  descripcion: 'Falta lugar',
  pronosticoId: id,
  existenciaId: null,
  fecha,
  franja: 'CENA',
  arquetipo: null,
  cantidad: 3,
});

describe('planificación de turnos', () => {
  let e: Escenario;
  let tenant: { restauranteId: string; sucursalId: string };

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    tenant = { restauranteId: e.restauranteId, sucursalId: e.sucursalId };
  });

  const contar = {
    pronosticos: () => prisma.pronostico.count({ where: { sucursalId: e.sucursalId } }),
    planificaciones: () => prisma.planificacionTurnos.count(),
    turnos: () => prisma.turno.count(),
    alertas: () => prisma.alerta.count(),
  };

  async function empleado(
    restauranteId: string,
    sucursales: string[],
    nombre: string,
    arquetipo: 'MOZO' | 'COCINERO' | 'OTRO' = 'MOZO',
    opciones: { horas?: number; activo?: boolean } = {},
  ) {
    const rol = await prisma.rol.create({
      data: { restauranteId, nombre: `${nombre}-rol`, arquetipo },
    });
    const usuario = await prisma.usuario.create({
      data: {
        email: `${nombre}-${Math.random()}@prueba.test`,
        passwordHash: 'x',
        tipo: 'EMPLEADO',
        activo: opciones.activo ?? true,
        empleado: {
          create: {
            restauranteId,
            rolId: rol.id,
            nombreCompleto: nombre,
            horasSemanalesMax: opciones.horas ?? 40,
            sucursales: { create: sucursales.map((sucursalId) => ({ sucursalId })) },
          },
        },
      },
    });
    return usuario.id;
  }

  async function horarios(sucursalId: string) {
    await prisma.horarioServicio.createMany({
      data: [
        { sucursalId, franja: 'ALMUERZO', horaInicio: hora('12:00'), horaFin: hora('16:00') },
        { sucursalId, franja: 'CENA', horaInicio: hora('20:00'), horaFin: hora('00:00') },
      ],
    });
  }

  it('guarda pronósticos, planificación, turnos y alertas en una transacción', async () => {
    const mozo = await empleado(e.restauranteId, [e.sucursalId], 'Ana');
    const creada = await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-09', 'CENA')], (p) => ({
        alertas: [alertaSobre(p[0]!.id, '2026-11-09')],
        turnos: [{ empleadoId: mozo, fecha: '2026-11-09', franja: 'CENA' }],
      })),
    );
    expect(creada).toBe(true);
    const plan = await planificacionRepository.deSemana(tenant, SEMANA);
    expect(plan).toMatchObject({ estado: 'BORRADOR', semanaDesde: SEMANA, confirmadaEn: null });
    expect(plan!.turnos).toEqual([
      { fecha: '2026-11-09', franja: 'CENA', empleadoId: mozo, nombre: 'Ana', arquetipo: 'MOZO' },
    ]);
    expect(plan!.alertas).toEqual([
      expect.objectContaining({
        tipo: 'CAPACIDAD_MESAS',
        fecha: '2026-11-09',
        franja: 'CENA',
        cantidad: 3,
      }),
    ]);
    // La dotación sale de los turnos y de los faltantes, no se guarda.
    expect(plan!.dotacion).toEqual([
      { fecha: '2026-11-09', franja: 'CENA', arquetipo: 'MOZO', cantidad: 1 },
    ]);
  });

  it('lee la semana ordenada, con nombres de ítem y números', async () => {
    await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([
        fila('2026-11-10', 'CENA'),
        fila('2026-11-09', 'CENA'),
        fila('2026-11-09', 'ALMUERZO', [{ itemMenuId: e.pizzaId, cantidad: 3 }]),
      ]),
    );
    const r = await aperturaRepository.pronosticosDeSemana(e.restauranteId, e.sucursalId, SEMANA);
    expect(r.map((p) => `${p.fecha} ${p.franja}`)).toEqual([
      '2026-11-09 ALMUERZO',
      '2026-11-09 CENA',
      '2026-11-10 CENA',
    ]);
    expect(r[0]).toMatchObject({ ingresoEstimado: 1234.5, errorMape: 12.34 });
    expect(r[0]!.demanda).toEqual([{ itemMenuId: e.pizzaId, nombre: 'Pizza', cantidad: 3 }]);
  });

  it('no lee pronósticos fuera de los 7 días de la semana', async () => {
    await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-08', 'CENA'), fila('2026-11-15', 'CENA'), fila('2026-11-16', 'CENA')]),
    );
    const r = await aperturaRepository.pronosticosDeSemana(e.restauranteId, e.sucursalId, SEMANA);
    expect(r.map((p) => p.fecha)).toEqual(['2026-11-15']);
  });

  it('la dotación suma los turnos y el faltante de cada franja y arquetipo', async () => {
    const mozo = await empleado(e.restauranteId, [e.sucursalId], 'Ana');
    await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-09', 'CENA')], () => ({
        alertas: [
          {
            ...alertaSobre(null, '2026-11-09'),
            tipo: 'FALTANTE_PERSONAL',
            severidad: 'CRITICA',
            arquetipo: 'MOZO',
            cantidad: 2,
          },
        ],
        turnos: [{ empleadoId: mozo, fecha: '2026-11-09', franja: 'CENA' }],
      })),
    );
    const plan = await planificacionRepository.deSemana(tenant, SEMANA);
    expect(plan!.dotacion).toEqual([
      { fecha: '2026-11-09', franja: 'CENA', arquetipo: 'MOZO', cantidad: 3 },
    ]);
    expect(plan!.alertas[0]).toMatchObject({ tipo: 'FALTANTE_PERSONAL', arquetipo: 'MOZO' });
  });

  it('si una fase lanza un error, no queda nada', async () => {
    const mozo = await empleado(e.restauranteId, [e.sucursalId], 'Ana');
    const rota: FasesPlanificacion = {
      pronosticar: async () => ({ suficiente: true, filas: [fila('2026-11-09', 'CENA')] }),
      planificar: async () => {
        throw new Error('falla');
      },
    };
    await expect(planificacionRepository.planificar(tenant, SEMANA, rota)).rejects.toThrow('falla');
    expect(await contar.pronosticos()).toBe(0);
    expect(await contar.planificaciones()).toBe(0);

    // También si falla al guardar los turnos: un turno de un empleado inexistente.
    const malos = fases([fila('2026-11-09', 'CENA')], (p) => ({
      alertas: [alertaSobre(p[0]!.id, '2026-11-09')],
      turnos: [
        { empleadoId: mozo, fecha: '2026-11-09', franja: 'CENA' },
        { empleadoId: e.sucursalId, fecha: '2026-11-09', franja: 'CENA' },
      ],
    }));
    await expect(planificacionRepository.planificar(tenant, SEMANA, malos)).rejects.toThrow();
    expect(await contar.pronosticos()).toBe(0);
    expect(await contar.planificaciones()).toBe(0);
    expect(await contar.turnos()).toBe(0);
    expect(await contar.alertas()).toBe(0);
  });

  it('con historial insuficiente dentro del lock no escribe', async () => {
    const f: FasesPlanificacion = {
      pronosticar: async () => ({ suficiente: false, filas: [] }),
      planificar: jest.fn(),
    };
    expect(await planificacionRepository.planificar(tenant, SEMANA, f)).toBe(false);
    expect(await planificacionRepository.reemplazarYPlanificar(tenant, SEMANA, f)).toBe(false);
    expect(f.planificar).not.toHaveBeenCalled();
    expect(await contar.planificaciones()).toBe(0);
  });

  it('pronósticos del 6B sin planificación: los conserva y agrega la planificación', async () => {
    await prisma.pronostico.create({
      data: {
        sucursalId: e.sucursalId,
        fechaServicio: new Date(`${SEMANA}T00:00:00Z`),
        franja: 'CENA',
        cubiertosEstimados: 7,
        limiteInferior: 5,
        limiteSuperior: 9,
        ingresoEstimado: 100,
        errorMape: 10,
        metodo: 'NAIVE_ESTACIONAL',
        demandasItem: { create: [{ itemMenuId: e.pizzaId, cantidadEstimada: 4 }] },
      },
    });
    const f = fases([fila('2026-11-09', 'ALMUERZO')]);
    expect(await planificacionRepository.planificar(tenant, SEMANA, f)).toBe(true);
    expect(f.pronosticar).not.toHaveBeenCalled();
    expect(f.planificar).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        fecha: '2026-11-09',
        franja: 'CENA',
        cubiertosEstimados: 7,
        demanda: [{ itemMenuId: e.pizzaId, cantidad: 4 }],
      }),
    ]);
    expect(await contar.pronosticos()).toBe(1);
    expect(await contar.planificaciones()).toBe(1);
  });

  it('con una planificación existente, planificar no recalcula', async () => {
    await planificacionRepository.planificar(tenant, SEMANA, fases([fila('2026-11-09', 'CENA')]));
    const f = fases([fila('2026-11-09', 'ALMUERZO')]);
    expect(await planificacionRepository.planificar(tenant, SEMANA, f)).toBe(false);
    expect(f.pronosticar).not.toHaveBeenCalled();
    expect(f.planificar).not.toHaveBeenCalled();
  });

  it('regenerar con alertas que apuntan a pronósticos no choca con la clave foránea', async () => {
    const mozo = await empleado(e.restauranteId, [e.sucursalId], 'Ana');
    await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-09', 'CENA'), fila('2026-11-10', 'CENA')], (p) => ({
        alertas: p.map((x) => alertaSobre(x.id, x.fecha)),
        turnos: [{ empleadoId: mozo, fecha: '2026-11-09', franja: 'CENA' }],
      })),
    );
    // Otra semana: no se toca.
    await planificacionRepository.planificar(
      tenant,
      '2026-11-16',
      fases([fila('2026-11-16', 'CENA')], (p) => ({
        alertas: [alertaSobre(p[0]!.id, '2026-11-16')],
        turnos: [],
      })),
    );
    expect(await contar.alertas()).toBe(3);

    const regenerado = await planificacionRepository.reemplazarYPlanificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-09', 'CENA', [], 30)], (p) => ({
        alertas: [alertaSobre(p[0]!.id, '2026-11-09')],
        turnos: [],
      })),
    );
    expect(regenerado).toBe(true);
    expect(await contar.pronosticos()).toBe(2);
    expect(await contar.planificaciones()).toBe(2);
    expect(await contar.turnos()).toBe(0);
    expect(await contar.alertas()).toBe(2);
    const nueva = await aperturaRepository.pronosticosDeSemana(
      e.restauranteId,
      e.sucursalId,
      SEMANA,
    );
    expect(nueva).toHaveLength(1);
    expect(nueva[0]).toMatchObject({ cubiertosEstimados: 30 });
  });

  it('regenerar una planificación confirmada responde 409 y no toca nada', async () => {
    await planificacionRepository.planificar(tenant, SEMANA, fases([fila('2026-11-09', 'CENA')]));
    const { id } = (await planificacionRepository.deSemana(tenant, SEMANA))!;
    await planificacionRepository.confirmar(tenant, id, AHORA);
    const f = fases([fila('2026-11-09', 'ALMUERZO')]);
    await expect(
      planificacionRepository.reemplazarYPlanificar(tenant, SEMANA, f),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.pronosticar).not.toHaveBeenCalled();
    expect(await contar.pronosticos()).toBe(1);
  });

  it('dos planificar en paralelo dejan una sola planificación', async () => {
    const f = () => ({
      pronosticar: jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return { suficiente: true, filas: [fila('2026-11-09', 'CENA')] };
      }),
      planificar: jest.fn(async () => vacio),
    });
    const a = f();
    const b = f();
    const resultados = await Promise.all([
      planificacionRepository.planificar(tenant, SEMANA, a),
      planificacionRepository.planificar(tenant, SEMANA, b),
    ]);
    expect(resultados.sort()).toEqual([false, true]);
    expect(a.pronosticar.mock.calls.length + b.pronosticar.mock.calls.length).toBe(1);
    expect(await contar.planificaciones()).toBe(1);
    expect(await contar.pronosticos()).toBe(1);
  });

  it('12 planificar en paralelo no agotan el pool y dejan una sola planificación', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 12 }, () =>
        planificacionRepository.planificar(tenant, SEMANA, {
          pronosticar: async (tx) => {
            await aperturaRepository.historial(e.restauranteId, e.sucursalId, tx);
            await planificacionRepository.contexto(tenant, SEMANA, tx);
            return { suficiente: true, filas: [fila('2026-11-09', 'CENA')] };
          },
          planificar: async () => vacio,
        }),
      ),
    );
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(await contar.planificaciones()).toBe(1);
  }, 30_000);

  it('dos confirmar a la vez: uno pasa y el otro responde 409', async () => {
    await planificacionRepository.planificar(tenant, SEMANA, fases([fila('2026-11-09', 'CENA')]));
    const { id } = (await planificacionRepository.deSemana(tenant, SEMANA))!;
    const resultados = await Promise.allSettled([
      planificacionRepository.confirmar(tenant, id, AHORA),
      planificacionRepository.confirmar(tenant, id, AHORA),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toMatchObject({ status: 409 });
    expect(await planificacionRepository.deSemana(tenant, SEMANA)).toMatchObject({
      estado: 'CONFIRMADA',
      confirmadaEn: AHORA.toISOString(),
    });
  });

  it('regenerar mientras se confirma nunca deja una confirmada modificada', async () => {
    const mozo = await empleado(e.restauranteId, [e.sucursalId], 'Ana');
    await planificacionRepository.planificar(
      tenant,
      SEMANA,
      fases([fila('2026-11-09', 'CENA')], () => ({
        alertas: [],
        turnos: [{ empleadoId: mozo, fecha: '2026-11-09', franja: 'CENA' }],
      })),
    );
    const antes = (await planificacionRepository.deSemana(tenant, SEMANA))!;
    const lento: FasesPlanificacion = {
      pronosticar: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { suficiente: true, filas: [fila('2026-11-09', 'CENA', [], 99)] };
      },
      planificar: async () => vacio,
    };
    const [regenerar, confirmar] = await Promise.allSettled([
      planificacionRepository.reemplazarYPlanificar(tenant, SEMANA, lento),
      planificacionRepository.confirmar(tenant, antes.id, AHORA),
    ]);
    const despues = (await planificacionRepository.deSemana(tenant, SEMANA))!;
    if (despues.estado === 'CONFIRMADA') {
      // Si ganó confirmar, regenerar se rechazó y la semana quedó intacta.
      expect(confirmar.status).toBe('fulfilled');
      expect(regenerar).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      expect(despues.turnos).toEqual(antes.turnos);
      expect(despues.id).toBe(antes.id);
    } else {
      // Si ganó regenerar, la planificación anterior ya no existe: 404, no hay nada que confirmar.
      expect(regenerar.status).toBe('fulfilled');
      expect(confirmar).toMatchObject({ status: 'rejected', reason: { status: 404 } });
      expect(despues.turnos).toEqual([]);
    }
  });

  it('confirmar una planificación ajena responde 404', async () => {
    await planificacionRepository.planificar(tenant, SEMANA, fases([fila('2026-11-09', 'CENA')]));
    const { id } = (await planificacionRepository.deSemana(tenant, SEMANA))!;
    const otro = await crearEscenario();
    await expect(
      planificacionRepository.confirmar(
        { restauranteId: otro.restauranteId, sucursalId: otro.sucursalId },
        id,
        AHORA,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      planificacionRepository.confirmar(
        { restauranteId: otro.restauranteId, sucursalId: e.sucursalId },
        id,
        AHORA,
      ),
    ).rejects.toThrow();
    expect(await planificacionRepository.deSemana(tenant, SEMANA)).toMatchObject({
      estado: 'BORRADOR',
    });
  });

  it('no ve la planificación de otra sucursal ni de otro restaurante', async () => {
    await planificacionRepository.planificar(tenant, SEMANA, fases([fila('2026-11-09', 'CENA')]));
    const otro = await crearEscenario();
    expect(
      await planificacionRepository.deSemana(
        { restauranteId: otro.restauranteId, sucursalId: otro.sucursalId },
        SEMANA,
      ),
    ).toBeNull();
    expect(
      await planificacionRepository.deSemana(
        { restauranteId: otro.restauranteId, sucursalId: e.sucursalId },
        SEMANA,
      ),
    ).toBeNull();
    const hermana = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Norte',
        direccion: 'x',
        horarioApertura: hora('12:00'),
        horarioCierre: hora('00:00'),
        toleranciaNoShowMin: 15,
      },
    });
    expect(
      await planificacionRepository.deSemana(
        { restauranteId: e.restauranteId, sucursalId: hermana.id },
        SEMANA,
      ),
    ).toBeNull();
  });

  it('planificar con una sucursal de otro restaurante falla sin escribir', async () => {
    const otro = await crearEscenario();
    await expect(
      planificacionRepository.planificar(
        { restauranteId: otro.restauranteId, sucursalId: e.sucursalId },
        SEMANA,
        fases([fila('2026-11-09', 'CENA')]),
      ),
    ).rejects.toThrow();
    expect(await contar.pronosticos()).toBe(0);
  });

  describe('contexto', () => {
    it('trae solo empleados activos de la sucursal; los turnos de otras sucursales ocupan la franja y suman horas', async () => {
      await horarios(e.sucursalId);
      const norte = await prisma.sucursal.create({
        data: {
          restauranteId: e.restauranteId,
          nombre: 'Norte',
          direccion: 'x',
          horarioApertura: hora('12:00'),
          horarioCierre: hora('00:00'),
          toleranciaNoShowMin: 15,
        },
      });
      await horarios(norte.id);
      const ana = await empleado(e.restauranteId, [e.sucursalId, norte.id], 'Ana');
      const beto = await empleado(e.restauranteId, [e.sucursalId], 'Beto', 'COCINERO', {
        horas: 20,
      });
      await empleado(e.restauranteId, [e.sucursalId], 'Inactivo', 'MOZO', { activo: false });
      await empleado(e.restauranteId, [norte.id], 'DeNorte');
      await empleado(e.restauranteId, [e.sucursalId], 'Gerente', 'OTRO');
      const otro = await crearEscenario();
      await empleado(otro.restauranteId, [otro.sucursalId], 'Ajeno');

      // Ana ya tiene la cena del lunes en Norte (4 h) y un almuerzo de la semana siguiente.
      const planNorte = await prisma.planificacionTurnos.create({
        data: { sucursalId: norte.id, semanaDesde: new Date(`${SEMANA}T00:00:00Z`) },
      });
      const planSig = await prisma.planificacionTurnos.create({
        data: { sucursalId: norte.id, semanaDesde: new Date('2026-11-16T00:00:00Z') },
      });
      await prisma.turno.createMany({
        data: [
          {
            planificacionId: planNorte.id,
            empleadoId: ana,
            sucursalId: norte.id,
            fecha: new Date('2026-11-09T00:00:00Z'),
            franja: 'CENA',
          },
          {
            planificacionId: planSig.id,
            empleadoId: ana,
            sucursalId: norte.id,
            fecha: new Date('2026-11-16T00:00:00Z'),
            franja: 'ALMUERZO',
          },
        ],
      });

      const ctx = await prisma.$transaction((tx) =>
        planificacionRepository.contexto(tenant, SEMANA, tx),
      );
      expect(ctx.empleados.map((x) => x.nombre).sort()).toEqual(['Ana', 'Beto']);
      const a = ctx.empleados.find((x) => x.id === ana)!;
      expect(a).toMatchObject({ arquetipo: 'MOZO', horasSemanalesMax: 40, horasYaAsignadas: 4 });
      expect([...a.ocupado]).toEqual(['2026-11-09|CENA']);
      const b = ctx.empleados.find((x) => x.id === beto)!;
      expect(b).toMatchObject({
        arquetipo: 'COCINERO',
        horasSemanalesMax: 20,
        horasYaAsignadas: 0,
      });
      expect(b.ocupado.size).toBe(0);
      expect(ctx.horarios).toHaveLength(2);
    });

    it('trae mesas activas, reservas pendientes y activas, existencias con unidad y recetas', async () => {
      await prisma.mesa.create({
        data: {
          sucursalId: e.sucursalId,
          numero: 5,
          capacidad: 6,
          posX: 1,
          posY: 1,
          activa: false,
        },
      });
      const mesa = await prisma.mesa.findFirstOrThrow({
        where: { sucursalId: e.sucursalId, activa: true },
      });
      await prisma.reserva.create({
        data: {
          sucursalId: e.sucursalId,
          mesaId: mesa.id,
          comensalId: e.comensalId,
          inicio: new Date('2026-11-10T23:00:00Z'),
          cantidadPersonas: 3,
          modoAsignacion: 'MANUAL',
          estado: 'PENDIENTE',
        },
      });
      await prisma.reserva.create({
        data: {
          sucursalId: e.sucursalId,
          mesaId: mesa.id,
          comensalId: e.comensalId,
          inicio: new Date('2026-11-10T21:00:00Z'),
          cantidadPersonas: 2,
          modoAsignacion: 'MANUAL',
          estado: 'CANCELADA',
        },
      });
      const ctx = await prisma.$transaction((tx) =>
        planificacionRepository.contexto(tenant, SEMANA, tx),
      );
      expect(ctx.capacidadMesas).toEqual([4]);
      expect(ctx.reservas.map((r) => r.cantidadPersonas).sort()).toContain(3);
      expect(ctx.reservas.map((r) => r.cantidadPersonas)).not.toContain(2);
      expect(ctx.existencias.get(e.harinaId)).toMatchObject({
        nombre: 'Harina',
        unidad: 'g',
        cantidad: 1000,
      });
      expect([...ctx.recetas.keys()]).toEqual([e.pizzaId]);
      expect(ctx.conReceta.has(e.pizzaId)).toBe(false); // la categoría de la prueba no exige receta
    });
  });

  it('un plato de reventa cuya demanda supera la existencia genera FALTANTE_STOCK_PREVISTO', async () => {
    const gaseosa = await prisma.componenteInventario.create({
      data: {
        restauranteId: e.restauranteId,
        tipo: 'INSUMO',
        nombre: 'Gaseosa',
        unidadBase: 'UNIDAD',
      },
    });
    await prisma.existencia.create({
      data: { sucursalId: e.sucursalId, componenteId: gaseosa.id, cantidadActual: 5 },
    });
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { restauranteId: e.restauranteId },
    });
    const reventa = await prisma.itemMenu.create({
      data: {
        restauranteId: e.restauranteId,
        categoriaId: categoria.id,
        nombre: 'Gaseosa 500',
        precio: 500,
        insumoId: gaseosa.id,
      },
    });
    const ctx = await prisma.$transaction((tx) =>
      planificacionRepository.contexto(tenant, SEMANA, tx),
    );
    expect(ctx.recetas.has(reventa.id)).toBe(true);
    expect(ctx.conReceta.has(reventa.id)).toBe(false);
    const alertas = crearVerificadorStock({
      semanaDesde: SEMANA,
      recetas: ctx.recetas,
      existencias: ctx.existencias,
    }).verificar([
      {
        id: 'p1',
        fecha: SEMANA,
        franja: 'CENA',
        cubiertosEstimados: 10,
        demanda: [{ itemMenuId: reventa.id, cantidad: 8 }],
      },
    ]);
    expect(alertas).toEqual([
      expect.objectContaining({ tipo: 'FALTANTE_STOCK_PREVISTO', cantidad: 3 }),
    ]);
    expect(alertas[0]!.descripcion).toContain('Gaseosa');
  });

  describe('simulación semanal', () => {
    it('con 12 semanas de historial planifica en 10 segundos o menos', async () => {
      await horarios(e.sucursalId);
      await prisma.configuracionApertura.create({
        data: { sucursalId: e.sucursalId, cubiertosPorMozo: 20, platosPorCocineroHora: 12 },
      });
      await empleado(e.restauranteId, [e.sucursalId], 'Ana');
      await empleado(e.restauranteId, [e.sucursalId], 'Beto', 'COCINERO');
      const mesa = await prisma.mesa.findFirstOrThrow({ where: { sucursalId: e.sucursalId } });

      // 12 semanas hasta ayer: dos servicios por día, con su cuenta cerrada y un pedido entregado.
      const desde = new Date('2026-08-10T00:00:00Z');
      const reservas = [];
      for (let d = 0; d < 12 * 7; d++) {
        for (const h of [15, 23]) {
          const inicio = new Date(desde.getTime() + d * 86_400_000 + h * 3_600_000);
          reservas.push({
            sucursalId: e.sucursalId,
            mesaId: mesa.id,
            comensalId: e.comensalId,
            inicio,
            cantidadPersonas: 4,
            modoAsignacion: 'MANUAL' as const,
            estado: 'FINALIZADA' as const,
            cuentaMesa: {
              create: {
                estado: 'CERRADA' as const,
                pedidos: {
                  create: {
                    sucursalId: e.sucursalId,
                    numero: d * 10 + h,
                    estado: 'ENTREGADO' as const,
                    lineas: {
                      create: [{ itemMenuId: e.pizzaId, cantidad: 2, precioUnitario: 1000 }],
                    },
                  },
                },
              },
            },
          });
        }
      }
      for (const r of reservas) await prisma.reserva.create({ data: r });

      const servicio = createAperturaService(aperturaRepository, planificacionRepository);
      const t0 = Date.now();
      const res = await servicio.obtenerAsistente(tenant, new Date('2026-11-04T15:00:00Z'));
      expect(Date.now() - t0).toBeLessThanOrEqual(10_000);
      expect(res.progreso.suficiente).toBe(true);
      expect(res.planificacion).not.toBeNull();
      expect(res.planificacion!.turnos.length).toBeGreaterThan(0);
      expect(res.pronosticos.length).toBeGreaterThan(0);
    }, 120_000);
  });
});
