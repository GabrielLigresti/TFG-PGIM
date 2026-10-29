import type { Prisma } from '../generated/prisma/client';
import { desdeDelCiclo, type DatosElegibilidad } from '../domain/beneficio';
import { prisma } from '../lib/prisma';
import { aFilaBeneficio, type FilaBeneficio } from './fidelizacion.repository';

// Lo que el comensal acumuló en un restaurante, para decidir qué beneficios
// puede usar y cuánto le falta para el resto. Recibe el cliente de Prisma para
// poder correr dentro de la transacción del pago.

type Db = Prisma.TransactionClient | typeof prisma;

export interface ElegibilidadBeneficio {
  datos: DatosElegibilidad;
  // El comensal ya lo canjeó en esta edición (desde vigencia_desde).
  canjeadoEnEdicion: boolean;
}

export interface Elegibilidad {
  puntos: number;
  porBeneficio: Map<string, ElegibilidadBeneficio>;
}

const delRestaurante = (restauranteId: string) => ({
  cuentaMesa: { reserva: { sucursal: { restauranteId } } },
});

export async function elegibilidad(
  db: Db,
  comensalId: string,
  restauranteId: string,
  beneficios: Pick<FilaBeneficio, 'id' | 'vigenciaDesde'>[],
): Promise<Elegibilidad> {
  const aprobados = { comensalId, estado: 'APROBADO' as const, ...delRestaurante(restauranteId) };
  const [cuenta, pagosAprobados] = await Promise.all([
    db.cuentaFidelidad.findUnique({
      where: { comensalId_restauranteId: { comensalId, restauranteId } },
      select: { id: true, puntos: true },
    }),
    db.pago.count({ where: aprobados }),
  ]);

  const porBeneficio = new Map<string, ElegibilidadBeneficio>();
  for (const b of beneficios) {
    const canje = await db.pago.findFirst({
      where: { ...aprobados, beneficiosAplicados: { some: { beneficioId: b.id } } },
      select: { fecha: true },
      orderBy: { fecha: 'desc' },
    });
    const ultimoCanje = canje?.fecha ?? null;
    const desde = desdeDelCiclo(b.vigenciaDesde, ultimoCanje);
    // Después de un canje cuenta lo posterior; el pago del canje no suma.
    const fecha = desde === ultimoCanje ? { gt: desde } : { gte: desde };
    const [visitas, monto] = await Promise.all([
      cuenta ? db.visita.count({ where: { cuentaFidelidadId: cuenta.id, fecha } }) : 0,
      db.pago.aggregate({ where: { ...aprobados, fecha }, _sum: { monto: true } }),
    ]);
    porBeneficio.set(b.id, {
      datos: {
        visitas,
        montoGastado: Number(monto._sum.monto ?? 0),
        puntos: cuenta?.puntos ?? 0,
        tienePagosAprobados: pagosAprobados > 0,
      },
      canjeadoEnEdicion: ultimoCanje !== null && ultimoCanje >= b.vigenciaDesde,
    });
  }
  return { puntos: cuenta?.puntos ?? 0, porBeneficio };
}

// Beneficios activos del restaurante que todavía no vencieron; el servicio
// calcula cuáles están vigentes.
export async function beneficiosActivos(
  db: Db,
  restauranteId: string,
  ahora: Date,
): Promise<FilaBeneficio[]> {
  const filas = await db.beneficio.findMany({
    where: {
      restauranteId,
      activo: true,
      vigenciaDesde: { lte: ahora },
      vigenciaHasta: { gt: ahora },
    },
    select: {
      id: true,
      nombre: true,
      clase: true,
      criterioTipo: true,
      criterioValor: true,
      tipoDescuento: true,
      valor: true,
      vigenciaDesde: true,
      vigenciaHasta: true,
      stockInicial: true,
      stockDisponible: true,
      activo: true,
      grupo: { select: { id: true, nombre: true } },
      menu: { select: { id: true, nombre: true } },
      _count: { select: { aplicaciones: { where: { pago: { estado: 'PENDIENTE' } } } } },
    },
    orderBy: { nombre: 'asc' },
  });
  return filas.map(aFilaBeneficio);
}

export interface ContextoMesa {
  restauranteId: string;
  menuActivoId: string | null;
  // Pedidos no cancelados menos pagos aprobados.
  saldo: number;
  // Un pago aprobado de esta mesa ya usó un beneficio (uno por mesa).
  beneficioUsado: boolean;
}

export async function contextoMesa(
  db: Db,
  comensalId: string,
  cuentaMesaId: string,
): Promise<ContextoMesa | null> {
  const cuenta = await db.cuentaMesa.findFirst({
    where: { id: cuentaMesaId, reserva: { comensalId } },
    select: {
      reserva: { select: { sucursal: { select: { restauranteId: true, menuActivoId: true } } } },
      pedidos: {
        where: { estado: { not: 'CANCELADO' } },
        select: { lineas: { select: { cantidad: true, precioUnitario: true } } },
      },
      pagos: {
        where: { estado: 'APROBADO' },
        select: { monto: true, beneficiosAplicados: { select: { montoDescontado: true } } },
      },
    },
  });
  if (!cuenta) return null;
  const total = cuenta.pedidos
    .flatMap((p) => p.lineas)
    .reduce((t, l) => t + l.cantidad * Number(l.precioUnitario), 0);
  // Lo descontado por un beneficio también cubre la cuenta.
  const cubierto = cuenta.pagos.reduce(
    (t, p) =>
      t +
      Number(p.monto) +
      p.beneficiosAplicados.reduce((d, b) => d + Number(b.montoDescontado), 0),
    0,
  );
  return {
    restauranteId: cuenta.reserva.sucursal.restauranteId,
    menuActivoId: cuenta.reserva.sucursal.menuActivoId,
    saldo: Math.round((total - cubierto) * 100) / 100,
    beneficioUsado: cuenta.pagos.some((p) => p.beneficiosAplicados.length > 0),
  };
}

export async function cuentasDelComensal(db: Db, comensalId: string) {
  const filas = await db.cuentaFidelidad.findMany({
    where: { comensalId },
    select: {
      puntos: true,
      cantidadVisitas: true,
      restaurante: {
        select: { id: true, nombre: true, programaFidelidad: { select: { id: true } } },
      },
    },
    orderBy: { restaurante: { nombre: 'asc' } },
  });
  return filas.map((f) => ({
    restaurante: { id: f.restaurante.id, nombre: f.restaurante.nombre },
    puntos: f.puntos,
    visitas: f.cantidadVisitas,
    programa: f.restaurante.programaFidelidad !== null,
  }));
}
