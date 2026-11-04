import type { ConfiguracionApertura, PlanificacionSemana } from '@pgim/shared';
import type { HistorialVentas } from '../domain/pronostico';
import type { BusEventos } from '../domain/eventos';
import type { AperturaRepository } from '../repositories/apertura.repository';
import type {
  FasesPlanificacion,
  PlanificacionRepository,
} from '../repositories/planificacion.repository';
import { createAperturaService } from './apertura.service';

const T = { restauranteId: 'r1', sucursalId: 's1' };
// Miércoles: la semana siguiente arranca el lunes 2026-11-09.
const AHORA = new Date('2026-11-04T15:00:00Z');
const SEMANA = '2026-11-09';
const CONFIG: ConfiguracionApertura = {
  semanasHistoricoMinimo: 8,
  cubiertosPorMozo: 20,
  platosPorCocineroHora: 12,
};

const horarios = [{ franja: 'ALMUERZO' as const, horaInicio: '12:00', horaFin: '16:00' }];
const historialCon = (primera: string): HistorialVentas => ({
  reservas: [{ inicio: new Date(primera), cantidadPersonas: 4, lineas: [] }],
  horarios,
  items: [],
});
// ~9 semanas de datos, y 2 semanas de datos.
const SUFICIENTE = historialCon('2026-09-01T16:00:00Z');
const INSUFICIENTE = historialCon('2026-10-20T16:00:00Z');

const PLAN: PlanificacionSemana = {
  id: 'pl1',
  estado: 'BORRADOR',
  semanaDesde: SEMANA,
  generadaEn: '2026-11-04T15:00:00.000Z',
  confirmadaEn: null,
  turnos: [],
  alertas: [],
  dotacion: [],
};

function repoFalso(historial: HistorialVentas, config: ConfiguracionApertura | null = CONFIG) {
  return {
    obtenerConfiguracion: jest.fn().mockResolvedValue(config),
    actualizarConfiguracion: jest.fn(),
    historial: jest.fn().mockResolvedValue(historial),
    pronosticosDeSemana: jest.fn().mockResolvedValue([]),
  } satisfies Record<keyof AperturaRepository, jest.Mock>;
}

function planFalso() {
  return {
    planificar: jest.fn().mockResolvedValue(true),
    reemplazarYPlanificar: jest.fn().mockResolvedValue(true),
    confirmar: jest.fn().mockResolvedValue({ ...PLAN, estado: 'CONFIRMADA' }),
    confirmarSemana: jest.fn().mockResolvedValue(SEMANA),
    deSemana: jest.fn().mockResolvedValue(null),
    turnosDe: jest.fn(),
    contexto: jest.fn(),
  } satisfies Record<keyof PlanificacionRepository, jest.Mock>;
}

function busFalso() {
  return { publicar: jest.fn(), suscribir: jest.fn() } satisfies BusEventos as BusEventos & {
    publicar: jest.Mock;
  };
}

function armar(
  repo: ReturnType<typeof repoFalso>,
  plan = planFalso(),
  bus: ReturnType<typeof busFalso> = busFalso(),
) {
  const servicio = createAperturaService(
    repo as unknown as AperturaRepository,
    plan as unknown as PlanificacionRepository,
    bus,
  );
  return { servicio, plan, bus };
}

describe('aperturaService', () => {
  it('sin configuración responde 404', async () => {
    const { servicio } = armar(repoFalso(SUFICIENTE, null));
    await expect(servicio.obtenerAsistente(T, AHORA)).rejects.toMatchObject({ status: 404 });
    await expect(servicio.regenerar(T, AHORA)).rejects.toMatchObject({ status: 404 });
    await expect(servicio.obtenerConfiguracion(T)).rejects.toMatchObject({ status: 404 });
  });

  it('con historial insuficiente devuelve el progreso, sin planificación, y no escribe', async () => {
    const { servicio, plan } = armar(repoFalso(INSUFICIENTE));
    const res = await servicio.obtenerAsistente(T, AHORA);
    expect(res).toMatchObject({
      semanaDesde: SEMANA,
      progreso: { semanas: 2, minimo: 8, suficiente: false },
      pronosticos: [],
      planificacion: null,
    });
    expect(plan.planificar).not.toHaveBeenCalled();
  });

  it('una semana ya planificada se devuelve con sus pronósticos aunque el historial no alcance', async () => {
    const repo = repoFalso(INSUFICIENTE);
    repo.pronosticosDeSemana.mockResolvedValue([{ fecha: SEMANA }]);
    const { servicio, plan } = armar(repo);
    plan.deSemana.mockResolvedValue(PLAN);
    const res = await servicio.obtenerAsistente(T, AHORA);
    expect(res.progreso.suficiente).toBe(false);
    expect(res.pronosticos).toEqual([{ fecha: SEMANA }]);
    expect(res.planificacion).toEqual(PLAN);
    expect(plan.planificar).not.toHaveBeenCalled();
  });

  it('con historial suficiente planifica si falta y devuelve pronósticos y planificación', async () => {
    const repo = repoFalso(SUFICIENTE);
    repo.pronosticosDeSemana.mockResolvedValue([{ fecha: SEMANA }]);
    const { servicio, plan } = armar(repo);
    plan.deSemana.mockResolvedValueOnce(null).mockResolvedValueOnce(PLAN);
    const res = await servicio.obtenerAsistente(T, AHORA);
    expect(plan.planificar).toHaveBeenCalledWith(T, SEMANA, expect.any(Object));
    expect(repo.pronosticosDeSemana).toHaveBeenCalledWith('r1', 's1', SEMANA);
    expect(res.progreso.suficiente).toBe(true);
    expect(res.pronosticos).toEqual([{ fecha: SEMANA }]);
    expect(res.planificacion).toEqual(PLAN);
  });

  it('con una planificación existente la devuelve sin recalcular', async () => {
    const { servicio, plan } = armar(repoFalso(SUFICIENTE));
    plan.deSemana.mockResolvedValue(PLAN);
    const res = await servicio.obtenerAsistente(T, AHORA);
    expect(plan.planificar).not.toHaveBeenCalled();
    expect(plan.reemplazarYPlanificar).not.toHaveBeenCalled();
    expect(res.planificacion).toEqual(PLAN);
  });

  describe('fases de la planificación', () => {
    const fasesDe = async (
      repo: ReturnType<typeof repoFalso>,
      plan: ReturnType<typeof planFalso>,
    ) => {
      await armar(repo, plan).servicio.obtenerAsistente(T, AHORA);
      return plan.planificar.mock.calls[0]![2] as FasesPlanificacion;
    };

    it('pronosticar relee configuración e historial dentro del lock, con la transacción', async () => {
      const repo = repoFalso(SUFICIENTE);
      const fases = await fasesDe(repo, planFalso());
      expect(repo.historial).toHaveBeenCalledTimes(1);
      const tx = { tx: true };
      const { suficiente, filas } = await fases.pronosticar(tx as never);
      expect(repo.historial).toHaveBeenCalledTimes(2);
      expect(repo.historial).toHaveBeenLastCalledWith('r1', 's1', tx);
      expect(repo.obtenerConfiguracion).toHaveBeenLastCalledWith('r1', 's1', tx);
      expect(suficiente).toBe(true);
      expect(filas).toHaveLength(7); // una franja, siete días
    });

    it('responde con el progreso recalculado dentro del lock, no con el de afuera', async () => {
      const repo = repoFalso(SUFICIENTE);
      const plan = planFalso();
      plan.planificar.mockImplementation(async (_t, _s, fases: FasesPlanificacion) => {
        repo.historial.mockResolvedValue(INSUFICIENTE);
        return (await fases.pronosticar({} as never)).suficiente;
      });
      repo.pronosticosDeSemana.mockResolvedValue([{ fecha: SEMANA }]);
      const res = await armar(repo, plan).servicio.obtenerAsistente(T, AHORA);
      expect(res.progreso).toMatchObject({ semanas: 2, suficiente: false });
      expect(res.pronosticos).toEqual([]);
      expect(res.planificacion).toBeNull();
    });

    it('planificar verifica stock, mesas y personal con el contexto leído', async () => {
      const repo = repoFalso(SUFICIENTE);
      const plan = planFalso();
      // Una pizza que consume 100 g de queso; hay 50 g. Una mesa de 4 y 40 cubiertos. Un solo mozo.
      const queso = {
        id: 'queso',
        nombre: 'Queso',
        tipo: 'INSUMO' as const,
        unidadBase: 'GRAMO' as const,
        activo: true,
        costoCompraVigente: 1,
        llevaStock: false,
        receta: null,
      };
      plan.contexto.mockResolvedValue({
        horarios,
        recetas: new Map([
          [
            'pizza',
            {
              rendimiento: 1,
              instrucciones: null,
              lineas: [{ componente: queso, cantidad: 100, unidad: 'GRAMO', porcentajeMerma: 0 }],
            },
          ],
        ]),
        existencias: new Map([
          ['queso', { existenciaId: 'ex1', nombre: 'Queso', unidad: 'g', cantidad: 50 }],
        ]),
        conReceta: new Set(['pizza']),
        capacidadMesas: [4],
        reservas: [],
        empleados: [
          {
            id: 'ana',
            nombre: 'Ana',
            arquetipo: 'MOZO',
            horasSemanalesMax: 40,
            horasYaAsignadas: 0,
            ocupado: new Set<string>(),
          },
        ],
      });
      const fases = await fasesDe(repo, plan);
      const resultado = await fases.planificar({} as never, [
        {
          id: 'p1',
          fecha: SEMANA,
          franja: 'ALMUERZO',
          cubiertosEstimados: 40,
          demanda: [{ itemMenuId: 'pizza', cantidad: 1 }],
        },
      ]);
      expect(plan.contexto).toHaveBeenCalledWith(T, SEMANA, expect.anything());
      expect(resultado.turnos).toEqual([{ empleadoId: 'ana', fecha: SEMANA, franja: 'ALMUERZO' }]);
      const porTipo = Object.fromEntries(resultado.alertas.map((a) => [a.tipo, a]));
      expect(porTipo.FALTANTE_STOCK_PREVISTO).toMatchObject({
        pronosticoId: 'p1',
        existenciaId: 'ex1',
      });
      expect(porTipo.FALTANTE_STOCK_PREVISTO!.descripcion).toContain('Queso');
      expect(porTipo.FALTANTE_STOCK_PREVISTO!.descripcion).toContain('g');
      expect(porTipo.CAPACIDAD_MESAS).toMatchObject({ pronosticoId: 'p1' });
      // 40 cubiertos piden 2 mozos y hay 1; el plato pide 1 cocinero y no hay ninguno.
      const faltantes = resultado.alertas.filter((a) => a.tipo === 'FALTANTE_PERSONAL');
      expect(faltantes).toEqual([
        expect.objectContaining({ pronosticoId: null, arquetipo: 'MOZO', cantidad: 1 }),
        expect.objectContaining({ pronosticoId: null, arquetipo: 'COCINERO', cantidad: 1 }),
      ]);
    });
  });

  it('al planificar ignora los pronósticos de una franja que ya no tiene horario', async () => {
    const repo = repoFalso(SUFICIENTE);
    const plan = planFalso();
    await armar(repo, plan).servicio.obtenerAsistente(T, AHORA);
    const fases = plan.planificar.mock.calls[0]![2] as FasesPlanificacion;
    plan.contexto.mockResolvedValue({
      horarios, // solo ALMUERZO
      recetas: new Map(),
      existencias: new Map(),
      conReceta: new Set<string>(),
      capacidadMesas: [4],
      reservas: [],
      empleados: [],
    });
    const resultado = await fases.planificar({} as never, [
      { id: 'a', fecha: SEMANA, franja: 'ALMUERZO', cubiertosEstimados: 10, demanda: [] },
      { id: 'c', fecha: SEMANA, franja: 'CENA', cubiertosEstimados: 80, demanda: [] },
    ]);
    // La cena (80 cubiertos) ni alerta capacidad ni pide mozos.
    expect(resultado.alertas.filter((a) => a.franja === 'CENA')).toEqual([]);
    expect(resultado.alertas.some((a) => a.franja === 'ALMUERZO')).toBe(true);
  });

  it('regenerar reemplaza y planifica', async () => {
    const repo = repoFalso(SUFICIENTE);
    const { servicio, plan } = armar(repo);
    plan.deSemana.mockResolvedValue(PLAN);
    const res = await servicio.regenerar(T, AHORA);
    expect(plan.reemplazarYPlanificar).toHaveBeenCalledWith(T, SEMANA, expect.any(Object));
    expect(res.semanaDesde).toBe(SEMANA);
    expect(res.planificacion).toEqual(PLAN);
  });

  it('regenerar con historial insuficiente devuelve el progreso y no escribe', async () => {
    const { servicio, plan } = armar(repoFalso(INSUFICIENTE));
    const res = await servicio.regenerar(T, AHORA);
    expect(res.pronosticos).toEqual([]);
    expect(res.planificacion).toBeNull();
    expect(res.progreso.suficiente).toBe(false);
    expect(plan.reemplazarYPlanificar).not.toHaveBeenCalled();
  });

  it('regenerar sobre una semana confirmada responde 409 aunque el historial no alcance', async () => {
    const { servicio, plan } = armar(repoFalso(INSUFICIENTE));
    plan.deSemana.mockResolvedValue({ ...PLAN, estado: 'CONFIRMADA' });
    await expect(servicio.regenerar(T, AHORA)).rejects.toMatchObject({ status: 409 });
    expect(plan.reemplazarYPlanificar).not.toHaveBeenCalled();
  });

  it('regenerar propaga el 409 de una planificación confirmada', async () => {
    const { servicio, plan } = armar(repoFalso(SUFICIENTE));
    plan.reemplazarYPlanificar.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
    await expect(servicio.regenerar(T, AHORA)).rejects.toMatchObject({ status: 409 });
  });

  describe('confirmar', () => {
    it('publica PLANIFICACION_CONFIRMADA apenas se hace el commit, antes de releer', async () => {
      const { servicio, plan, bus } = armar(repoFalso(SUFICIENTE));
      let resolver!: (semana: string) => void;
      plan.confirmarSemana.mockReturnValue(new Promise((r) => (resolver = r)));
      plan.deSemana.mockResolvedValue({ ...PLAN, estado: 'CONFIRMADA' });
      const promesa = servicio.confirmar(T, 'pl1', AHORA);
      await Promise.resolve();
      expect(bus.publicar).not.toHaveBeenCalled();
      resolver(SEMANA);
      const res = await promesa;
      expect(plan.confirmarSemana).toHaveBeenCalledWith(T, 'pl1', AHORA);
      expect(bus.publicar).toHaveBeenCalledWith({
        tipo: 'PLANIFICACION_CONFIRMADA',
        sucursalId: 's1',
        planificacionId: 'pl1',
      });
      expect(res.estado).toBe('CONFIRMADA');
    });

    it('si falla la relectura, el aviso ya salió', async () => {
      const { servicio, plan, bus } = armar(repoFalso(SUFICIENTE));
      plan.deSemana.mockRejectedValue(new Error('base caída'));
      await expect(servicio.confirmar(T, 'pl1', AHORA)).rejects.toThrow('base caída');
      expect(bus.publicar).toHaveBeenCalledTimes(1);
    });

    it('si el commit falla, no publica', async () => {
      const { servicio, plan, bus } = armar(repoFalso(SUFICIENTE));
      plan.confirmarSemana.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
      await expect(servicio.confirmar(T, 'pl1', AHORA)).rejects.toMatchObject({ status: 409 });
      expect(bus.publicar).not.toHaveBeenCalled();
    });
  });

  it('actualizarConfiguracion responde 404 si la sucursal no tiene configuración', async () => {
    const repo = repoFalso(SUFICIENTE);
    const { servicio } = armar(repo);
    repo.actualizarConfiguracion.mockResolvedValue(null);
    await expect(servicio.actualizarConfiguracion(T, CONFIG)).rejects.toMatchObject({
      status: 404,
    });
    repo.actualizarConfiguracion.mockResolvedValue(CONFIG);
    await expect(servicio.actualizarConfiguracion(T, CONFIG)).resolves.toEqual(CONFIG);
  });
});
