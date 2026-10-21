// Datos ficticios de prueba. Es idempotente: se puede correr varias veces sin
// duplicar filas (npm run db:seed -w @pgim/api).
import {
  PERMISOS,
  ROLES_PREDETERMINADOS,
  type CodigoPermiso,
  type RolPredeterminado,
} from '@pgim/shared';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import type { Prisma } from '../src/generated/prisma/client';

const PASSWORD_DEMO = 'demo1234';

// Roles de staff que crearía el Administrador; solo existen en el seed.
const ROLES_STAFF: RolPredeterminado[] = [
  {
    nombre: 'Mozo',
    arquetipo: 'MOZO',
    permisos: [
      'reserva.ver',
      'reserva.activar',
      'mesa.cerrar',
      'pedido.ver',
      'pedido.avanzar',
      'pago.ver',
      'menu.ver',
      'turno.ver',
    ],
  },
  {
    nombre: 'Cocinero',
    arquetipo: 'COCINERO',
    permisos: ['stock.registrar', 'pedido.ver', 'pedido.avanzar', 'turno.ver'],
  },
];

const SUCURSALES = [
  { nombre: 'Centro', direccion: 'Av. Siempre Viva 742' },
  { nombre: 'Palermo', direccion: 'Calle Falsa 123' },
] as const;

type NombreSucursal = (typeof SUCURSALES)[number]['nombre'];

const EMPLEADOS: {
  email: string;
  nombreCompleto: string;
  rol: string;
  sucursales: NombreSucursal[];
}[] = [
  {
    email: 'admin@demo.pgim.test',
    nombreCompleto: 'Ana Admin',
    rol: 'Administrador',
    sucursales: ['Centro', 'Palermo'],
  },
  {
    email: 'gerente@demo.pgim.test',
    nombreCompleto: 'Germán Gerente',
    rol: 'Gerente de sucursal',
    sucursales: ['Centro'],
  },
  {
    email: 'cocina@demo.pgim.test',
    nombreCompleto: 'Julia Jefa',
    rol: 'Jefe de cocina',
    sucursales: ['Centro'],
  },
  {
    email: 'mozo@demo.pgim.test',
    nombreCompleto: 'Mario Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'cocinero@demo.pgim.test',
    nombreCompleto: 'Carla Cocinera',
    rol: 'Cocinero',
    sucursales: ['Palermo'],
  },
];

// Las columnas time se guardan como DateTime; Prisma ignora la fecha.
function hora(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

async function seedPermisos(tx: Prisma.TransactionClient): Promise<Map<CodigoPermiso, string>> {
  const ids = new Map<CodigoPermiso, string>();
  for (const { codigo, modulo, accion } of PERMISOS) {
    const permiso = await tx.permiso.upsert({
      where: { codigo },
      update: { modulo, accion },
      create: { codigo, modulo, accion },
    });
    ids.set(codigo, permiso.id);
  }
  return ids;
}

async function seedRol(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  rol: RolPredeterminado,
  predeterminado: boolean,
  permisoIds: Map<CodigoPermiso, string>,
): Promise<string> {
  const { id } = await tx.rol.upsert({
    where: { restauranteId_nombre: { restauranteId, nombre: rol.nombre } },
    update: { arquetipo: rol.arquetipo, predeterminado, activo: true },
    create: { restauranteId, nombre: rol.nombre, arquetipo: rol.arquetipo, predeterminado },
  });

  await tx.rolPermiso.deleteMany({ where: { rolId: id } });
  await tx.rolPermiso.createMany({
    data: rol.permisos.map((codigo) => ({ rolId: id, permisoId: permisoIds.get(codigo)! })),
  });
  return id;
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD_DEMO);

  await prisma.$transaction(async (tx) => {
    const permisoIds = await seedPermisos(tx);

    const restaurante = await tx.restaurante.upsert({
      where: { cuit: '30-00000000-0' },
      update: { nombre: 'La Parrilla Demo' },
      create: { nombre: 'La Parrilla Demo', cuit: '30-00000000-0' },
    });

    const sucursalIds = new Map<NombreSucursal, string>();
    for (const { nombre, direccion } of SUCURSALES) {
      const datos = {
        direccion,
        horarioApertura: hora('12:00'),
        horarioCierre: hora('00:00'),
        toleranciaNoShowMin: 15,
        activa: true,
      };
      const existente = await tx.sucursal.findFirst({
        where: { restauranteId: restaurante.id, nombre },
      });
      const sucursal = existente
        ? await tx.sucursal.update({ where: { id: existente.id }, data: datos })
        : await tx.sucursal.create({ data: { restauranteId: restaurante.id, nombre, ...datos } });
      sucursalIds.set(nombre, sucursal.id);
    }

    const rolIds = new Map<string, string>();
    for (const rol of ROLES_PREDETERMINADOS) {
      rolIds.set(rol.nombre, await seedRol(tx, restaurante.id, rol, true, permisoIds));
    }
    for (const rol of ROLES_STAFF) {
      rolIds.set(rol.nombre, await seedRol(tx, restaurante.id, rol, false, permisoIds));
    }

    for (const empleado of EMPLEADOS) {
      const usuario = await tx.usuario.upsert({
        where: { email: empleado.email },
        update: { passwordHash, activo: true },
        create: { email: empleado.email, passwordHash, tipo: 'EMPLEADO' },
      });
      const datos = {
        restauranteId: restaurante.id,
        rolId: rolIds.get(empleado.rol)!,
        nombreCompleto: empleado.nombreCompleto,
        horasSemanalesMax: 48,
      };
      await tx.empleado.upsert({
        where: { usuarioId: usuario.id },
        update: datos,
        create: { usuarioId: usuario.id, ...datos },
      });

      await tx.empleadoSucursal.deleteMany({ where: { empleadoId: usuario.id } });
      await tx.empleadoSucursal.createMany({
        data: empleado.sucursales.map((nombre) => ({
          empleadoId: usuario.id,
          sucursalId: sucursalIds.get(nombre)!,
        })),
      });
    }

    const comensal = await tx.usuario.upsert({
      where: { email: 'comensal@demo.pgim.test' },
      update: { passwordHash, activo: true },
      create: { email: 'comensal@demo.pgim.test', passwordHash, tipo: 'COMENSAL' },
    });
    await tx.comensal.upsert({
      where: { usuarioId: comensal.id },
      update: { nombre: 'Carlos Comensal' },
      create: { usuarioId: comensal.id, nombre: 'Carlos Comensal' },
    });
  });

  const [permisos, roles, sucursales, usuarios] = await Promise.all([
    prisma.permiso.count(),
    prisma.rol.count(),
    prisma.sucursal.count(),
    prisma.usuario.count(),
  ]);
  console.log(
    `Seed listo: ${permisos} permisos, ${roles} roles, ${sucursales} sucursales, ${usuarios} usuarios (contraseña: ${PASSWORD_DEMO}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
