import type {
  EstadoReserva,
  ReservaPanel,
  FranjaDisponible,
  MapaDeFranja,
  ReservaComensal,
  ReservaInput,
} from '@pgim/shared';
import { busEventos, type BusEventos, type TipoEventoReserva } from '../domain/eventos';
import { elegirMesa, esFechaReservable, fechaDe, iniciosDelDia } from '../domain/franjas';
import {
  estadoDeReserva,
  limiteDeLlegada,
  puedeActivarse,
  puedeCancelarse,
} from '../domain/reserva';
import { AppError, esClaveDuplicada } from '../lib/errors';
import { horaArgentina } from '../lib/hora';
import {
  reservaRepository,
  type FilaReserva,
  type FilaReservaPanel,
  type ReservaRepository,
  type SucursalReservable,
} from '../repositories/reserva.repository';

const MESA_NO_DISPONIBLE = 'La mesa ya no está disponible';

// Mesas ocupadas por inicio de franja. Las fechas se comparan por su ISO,
// nunca como objetos Date.
function ocupadasPorInicio(filas: { mesaId: string; inicio: Date }[]): Map<string, Set<string>> {
  const porInicio = new Map<string, Set<string>>();
  for (const { mesaId, inicio } of filas) {
    const clave = inicio.toISOString();
    porInicio.set(clave, (porInicio.get(clave) ?? new Set()).add(mesaId));
  }
  return porInicio;
}

// CU-03 Reservar mesa (secuencia CU-03 v1), con la cancelación del comensal.
export function createReservaService(
  repo: ReservaRepository,
  bus: BusEventos,
  ahora: () => Date = () => new Date(),
) {
  async function sucursalReservable(sucursalId: string): Promise<SucursalReservable> {
    const sucursal = await repo.buscarSucursalReservable(sucursalId);
    if (!sucursal) throw new AppError(404, 'La sucursal no existe');
    return sucursal;
  }

  // El inicio tiene que ser una franja de la sucursal, dentro del rango
  // reservable y que todavía no empezó.
  function validarInicio(sucursal: SucursalReservable, inicio: Date) {
    const fecha = fechaDe(inicio);
    const esFranja = iniciosDelDia(fecha, sucursal.horarioApertura, sucursal.horarioCierre).some(
      (f) => f.getTime() === inicio.getTime(),
    );
    if (!esFechaReservable(fecha, ahora()) || !esFranja || inicio <= ahora()) {
      throw new AppError(400, 'Elegí una franja disponible');
    }
  }

  function aReservaComensal(fila: FilaReserva): ReservaComensal {
    const ctx = { inicio: fila.inicio, toleranciaNoShowMin: fila.toleranciaNoShowMin };
    return {
      id: fila.id,
      sucursal: { id: fila.sucursalId, nombre: fila.sucursalNombre },
      mesa: { id: fila.mesaId, numero: fila.mesaNumero },
      inicio: fila.inicio.toISOString(),
      cantidadPersonas: fila.cantidadPersonas,
      modoAsignacion: fila.modoAsignacion,
      estado: fila.estado,
      limiteLlegada: limiteDeLlegada(ctx).toISOString(),
      cancelable: fila.estado === 'PENDIENTE' && puedeCancelarse({ ...ctx, ahora: ahora() }),
    };
  }

  function aReservaPanel(fila: FilaReservaPanel): ReservaPanel {
    const ctx = {
      inicio: fila.inicio,
      toleranciaNoShowMin: fila.toleranciaNoShowMin,
      ahora: ahora(),
    };
    return {
      id: fila.id,
      comensal: { nombre: fila.comensalNombre, telefono: fila.comensalTelefono },
      mesa: { id: fila.mesaId, numero: fila.mesaNumero },
      inicio: fila.inicio.toISOString(),
      cantidadPersonas: fila.cantidadPersonas,
      estado: fila.estado,
      limiteLlegada: limiteDeLlegada(ctx).toISOString(),
      activable: fila.estado === 'PENDIENTE' && puedeActivarse(ctx),
    };
  }

  // Se publica después de la escritura, ya confirmada en la base.
  function publicar(tipo: TipoEventoReserva, fila: FilaReserva, estado: EstadoReserva) {
    bus.publicar({
      tipo,
      reserva: {
        id: fila.id,
        sucursalId: fila.sucursalId,
        comensalId: fila.comensalId,
        mesaId: fila.mesaId,
        inicio: fila.inicio,
        estado,
      },
    });
  }

  return {
    async franjasDisponibles(
      sucursalId: string,
      fecha: string,
      personas: number,
    ): Promise<FranjaDisponible[]> {
      const sucursal = await sucursalReservable(sucursalId);
      if (!esFechaReservable(fecha, ahora())) {
        throw new AppError(400, 'Elegí una fecha entre hoy y los próximos 30 días');
      }
      const inicios = iniciosDelDia(fecha, sucursal.horarioApertura, sucursal.horarioCierre).filter(
        (inicio) => inicio > ahora(),
      );
      if (inicios.length === 0) return [];
      const [mesas, ocupadas] = await Promise.all([
        repo.listarMesasActivas(sucursalId),
        repo.mesasOcupadas(sucursalId, inicios),
      ]);
      const porInicio = ocupadasPorInicio(ocupadas);
      return inicios.flatMap((inicio) => {
        const tomadas = porInicio.get(inicio.toISOString()) ?? new Set<string>();
        const libres = mesas.filter((m) => m.capacidad >= personas && !tomadas.has(m.id));
        return libres.length === 0
          ? []
          : [
              {
                inicio: inicio.toISOString(),
                hora: horaArgentina(inicio),
                mesasLibres: libres.length,
              },
            ];
      });
    },

    async mapa(sucursalId: string, inicio: Date, personas: number): Promise<MapaDeFranja> {
      const sucursal = await sucursalReservable(sucursalId);
      validarInicio(sucursal, inicio);
      const [mesas, ocupadas] = await Promise.all([
        repo.listarMesasActivas(sucursalId),
        repo.mesasOcupadas(sucursalId, [inicio]),
      ]);
      const tomadas = new Set(ocupadas.map((o) => o.mesaId));
      return {
        inicio: inicio.toISOString(),
        mesas: mesas.map(({ id, numero, capacidad, posX, posY }) => ({
          id,
          numero,
          capacidad,
          posX,
          posY,
          estado: tomadas.has(id) ? 'RESERVADA' : capacidad < personas ? 'CHICA' : 'LIBRE',
        })),
      };
    },

    async reservar(comensalId: string, datos: ReservaInput): Promise<ReservaComensal> {
      const sucursal = await sucursalReservable(datos.sucursalId);
      const inicio = new Date(datos.inicio);
      validarInicio(sucursal, inicio);
      if (await repo.comensalTieneReservaEn(comensalId, inicio)) {
        throw new AppError(409, 'Ya tenés una reserva a esa hora');
      }

      const [mesas, ocupadas] = await Promise.all([
        repo.listarMesasActivas(sucursal.id),
        repo.mesasOcupadas(sucursal.id, [inicio]),
      ]);
      const tomadas = new Set(ocupadas.map((o) => o.mesaId));
      let mesaId: string;
      if (datos.mesaId) {
        const mesa = mesas.find((m) => m.id === datos.mesaId);
        if (!mesa) throw new AppError(404, 'La mesa no existe');
        if (mesa.capacidad < datos.personas) {
          throw new AppError(409, `La mesa ${mesa.numero} es para ${mesa.capacidad} personas`);
        }
        if (tomadas.has(mesa.id)) throw new AppError(409, MESA_NO_DISPONIBLE);
        mesaId = mesa.id;
      } else {
        const mesa = elegirMesa(mesas, tomadas, datos.personas);
        if (!mesa) throw new AppError(409, 'No hay mesas disponibles para esa franja');
        mesaId = mesa.id;
      }

      let fila: FilaReserva | null;
      try {
        fila = await repo.crear({
          sucursalId: sucursal.id,
          mesaId,
          comensalId,
          inicio,
          cantidadPersonas: datos.personas,
          modoAsignacion: datos.mesaId ? 'MANUAL' : 'AUTOMATICA',
        });
      } catch (err) {
        // E2: otra reserva tomó la mesa entre el control y el alta; la
        // rechazó el índice único parcial de la base.
        if (esClaveDuplicada(err)) throw new AppError(409, MESA_NO_DISPONIBLE);
        throw err;
      }
      if (!fila) throw new AppError(409, 'Ya tenés una reserva a esa hora');
      publicar('RESERVA_CREADA', fila, fila.estado);
      return aReservaComensal(fila);
    },

    async misReservas(comensalId: string): Promise<ReservaComensal[]> {
      return (await repo.listarDelComensal(comensalId)).map(aReservaComensal);
    },

    async cancelar(comensalId: string, id: string): Promise<ReservaComensal> {
      const fila = await repo.buscarDelComensal(comensalId, id);
      if (!fila) throw new AppError(404, 'La reserva no existe');
      const hacia = estadoDeReserva(fila.estado).cancelar({
        inicio: fila.inicio,
        toleranciaNoShowMin: fila.toleranciaNoShowMin,
        ahora: ahora(),
      });
      if (!(await repo.cambiarEstado({ comensalId }, id, fila.estado, hacia))) {
        throw new AppError(409, 'La reserva cambió de estado; recargá la pantalla');
      }
      publicar('RESERVA_CANCELADA', fila, hacia);
      return aReservaComensal({ ...fila, estado: hacia });
    },

    // CU-21: la tarea programada vence las pendientes pasada la tolerancia.
    // Devuelve cuántas venció.
    async vencerPendientes(): Promise<number> {
      const momento = ahora();
      let vencidas = 0;
      for (const fila of await repo.pendientesIniciadas(momento)) {
        const ctx = {
          inicio: fila.inicio,
          toleranciaNoShowMin: fila.toleranciaNoShowMin,
          ahora: momento,
        };
        if (momento <= limiteDeLlegada(ctx)) continue;
        const hacia = estadoDeReserva(fila.estado).vencer(ctx);
        // Si mientras tanto la activaron o la cancelaron, no se toca.
        if (await repo.cambiarEstado({ sistema: true }, fila.id, fila.estado, hacia)) {
          publicar('RESERVA_VENCIDA', fila, hacia);
          vencidas++;
        }
      }
      return vencidas;
    },

    // CU-12: reservas de un día (hora de Argentina) de la sucursal de trabajo.
    async delDia(
      restauranteId: string,
      sucursalId: string,
      fecha: string,
    ): Promise<ReservaPanel[]> {
      const desde = iniciosDelDia(fecha, '00:00', '00:00')[0]!;
      const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
      return (await repo.listarDelDia(restauranteId, sucursalId, desde, hasta)).map(aReservaPanel);
    },

    // CU-12 Activar reserva: el comensal llegó; se abre la cuenta de mesa.
    async activar(restauranteId: string, sucursalId: string, id: string): Promise<ReservaPanel> {
      const fila = await repo.buscarEnSucursal(restauranteId, sucursalId, id);
      if (!fila) throw new AppError(404, 'La reserva no existe');
      const hacia = estadoDeReserva(fila.estado).activar({
        inicio: fila.inicio,
        toleranciaNoShowMin: fila.toleranciaNoShowMin,
        ahora: ahora(),
      });
      if (!(await repo.activar(restauranteId, sucursalId, id, fila.estado, hacia))) {
        throw new AppError(409, 'La reserva cambió de estado; recargá la pantalla');
      }
      publicar('RESERVA_ACTIVADA', fila, hacia);
      return aReservaPanel({ ...fila, estado: hacia });
    },
  };
}

export const reservaService = createReservaService(reservaRepository, busEventos);
