// Datos ficticios de prueba. Es idempotente: se puede correr varias veces sin
// duplicar filas (npm run db:seed -w @pgim/api).
import {
  CONFIGURACION_APERTURA_POR_DEFECTO,
  PERMISOS,
  type CodigoPermiso,
  type Franja,
  type RolPredeterminado,
} from '@pgim/shared';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CARPETA_MODELOS, borrarModelo, guardarModelo } from '../src/lib/archivos-modelo';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { aHora } from '../src/lib/hora';
import { generarReservasHistorial, SEMILLA_HISTORIAL } from '../src/lib/historial-ventas';
import type { Prisma } from '../src/generated/prisma/client';
import {
  costoTeorico,
  costoUnitario,
  insumosNecesarios,
  type Componente,
} from '../src/domain/receta';
import { iniciosDelDia, sumarDias } from '../src/domain/franjas';
import { semanaSiguiente } from '../src/domain/pronostico';
import { produccionService } from '../src/services/produccion.service';
import { recetaRepository } from '../src/repositories/receta.repository';
import { crearRolesPredeterminados, upsertRol } from '../src/repositories/roles-predeterminados';
import { stockRepository } from '../src/repositories/stock.repository';
import type { UnidadBase, UnidadMedida } from '@pgim/shared';

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
    permisos: ['stock.registrar', 'pedido.ver', 'pedido.gestionar_cola', 'turno.ver'],
  },
];

const SUCURSALES = [
  { nombre: 'Centro', direccion: 'Av. Siempre Viva 742' },
  { nombre: 'Palermo', direccion: 'Calle Falsa 123' },
] as const;

type NombreSucursal = (typeof SUCURSALES)[number]['nombre'];

// Salón de cada sucursal (CU-14): capacidades en orden de número de mesa,
// ubicadas en una grilla sobre el lienzo de 100 × 60.
interface SalonSeed {
  capacidades: number[];
  columnas: number;
  x0: number;
  pasoX: number;
}

const SALONES: Record<NombreSucursal, SalonSeed> = {
  Centro: { capacidades: [2, 2, 4, 4, 4, 6, 6, 8, 2, 4], columnas: 5, x0: 10, pasoX: 20 },
  Palermo: { capacidades: [2, 4, 4, 6, 2, 8], columnas: 3, x0: 20, pasoX: 30 },
};

const COMENSALES = [
  { email: 'comensal@demo.pgim.test', nombre: 'Carlos Comensal' },
  { email: 'comensal2@demo.pgim.test', nombre: 'Lucía Comensal' },
];

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
  // Plantel de Centro para la demo del simulador: cinco mozos y dos cocineros
  // (con la jefa de cocina, que también cuenta como cocinera para los turnos),
  // lo justo para que la grilla muestre reparto y todavía falte gente en los picos.
  {
    email: 'mozo2@demo.pgim.test',
    nombreCompleto: 'Marta Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'mozo3@demo.pgim.test',
    nombreCompleto: 'Nicolás Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'mozo4@demo.pgim.test',
    nombreCompleto: 'Paula Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'mozo5@demo.pgim.test',
    nombreCompleto: 'Rubén Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'cocinero2@demo.pgim.test',
    nombreCompleto: 'Silvia Cocinera',
    rol: 'Cocinero',
    sucursales: ['Centro'],
  },
];

// Las columnas time se guardan como DateTime; Prisma ignora la fecha.
function hora(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

const HORARIOS_SERVICIO = [
  { franja: 'ALMUERZO', horaInicio: hora('12:00'), horaFin: hora('16:00') },
  { franja: 'CENA', horaInicio: hora('20:00'), horaFin: hora('00:00') },
] as const;

const CATEGORIAS = [
  { nombre: 'Entradas', requiereReceta: false, admiteObservaciones: true },
  { nombre: 'Principales', requiereReceta: true, admiteObservaciones: true },
  { nombre: 'Postres', requiereReceta: true, admiteObservaciones: true },
  // Las bebidas no llevan aclaración.
  { nombre: 'Bebidas', requiereReceta: false, admiteObservaciones: false },
] as const;

type NombreCategoria = (typeof CATEGORIAS)[number]['nombre'];

// Costos ficticios por unidad base; stock inicial de la sucursal Centro.
const INSUMOS: { nombre: string; unidadBase: UnidadBase; costo: number; stock: number }[] = [
  { nombre: 'Carne vacuna', unidadBase: 'GRAMO', costo: 18, stock: 20000 },
  { nombre: 'Queso provolone', unidadBase: 'GRAMO', costo: 14, stock: 5000 },
  { nombre: 'Papa', unidadBase: 'GRAMO', costo: 1.2, stock: 15000 },
  { nombre: 'Tomate', unidadBase: 'GRAMO', costo: 2.5, stock: 6000 },
  { nombre: 'Cebolla', unidadBase: 'GRAMO', costo: 1.5, stock: 6000 },
  { nombre: 'Morrón', unidadBase: 'GRAMO', costo: 4, stock: 3000 },
  { nombre: 'Aceite de oliva', unidadBase: 'MILILITRO', costo: 12, stock: 5000 },
  { nombre: 'Vinagre', unidadBase: 'MILILITRO', costo: 3, stock: 2000 },
  { nombre: 'Sal', unidadBase: 'GRAMO', costo: 0.5, stock: 3000 },
  { nombre: 'Huevo', unidadBase: 'UNIDAD', costo: 250, stock: 120 },
  { nombre: 'Leche', unidadBase: 'MILILITRO', costo: 1.5, stock: 10000 },
  { nombre: 'Azúcar', unidadBase: 'GRAMO', costo: 1.2, stock: 5000 },
  // Reventa: las bebidas se venden como vienen y descuentan una botella.
  { nombre: 'Agua mineral 500 ml', unidadBase: 'UNIDAD', costo: 600, stock: 48 },
];

type LineaSeed = [componente: string, cantidad: number, unidad: UnidadMedida, merma?: number];

interface RecetaSeed {
  rendimiento: number;
  instrucciones: string;
  lineas: LineaSeed[];
}

const SALSA_CRIOLLA: RecetaSeed = {
  rendimiento: 1000,
  instrucciones: 'Picar las verduras chico y mezclar con el aceite, el vinagre y la sal.',
  lineas: [
    ['Tomate', 400, 'GRAMO', 10],
    ['Cebolla', 300, 'GRAMO', 10],
    ['Morrón', 200, 'GRAMO', 15],
    ['Aceite de oliva', 100, 'MILILITRO'],
    ['Vinagre', 50, 'MILILITRO'],
    ['Sal', 10, 'GRAMO'],
  ],
};

// Intermedio sin stock: se explota hasta sus insumos en cada pedido.
const CHIMICHURRI: RecetaSeed = {
  rendimiento: 300,
  instrucciones: 'Picar todo fino y dejar reposar en el aceite y el vinagre.',
  lineas: [
    ['Aceite de oliva', 100, 'MILILITRO'],
    ['Vinagre', 50, 'MILILITRO'],
    ['Cebolla', 100, 'GRAMO', 10],
    ['Morrón', 50, 'GRAMO', 15],
    ['Sal', 5, 'GRAMO'],
  ],
};

// Las fotos están en apps/web/public/fotos-demo (licencias en su LICENCIA.md).
// "Milanesa con puré" queda sin receta a propósito: es un principal y la
// categoría la exige, así que la pantalla de platos lo marca.
const PLATOS: {
  nombre: string;
  categoria: NombreCategoria;
  precio: number;
  descripcion: string;
  foto: string;
  receta?: RecetaSeed;
  // Nombre del insumo que se revende como viene (sin receta).
  reventa?: string;
}[] = [
  {
    nombre: 'Provoleta',
    categoria: 'Entradas',
    precio: 7500,
    descripcion: 'Queso provolone a la parrilla con orégano.',
    foto: 'provoleta.jpg',
    receta: {
      rendimiento: 1,
      instrucciones: 'Grillar el queso en la plancha de hierro hasta dorar.',
      lineas: [
        ['Queso provolone', 200, 'GRAMO'],
        ['Aceite de oliva', 10, 'MILILITRO'],
        ['Chimichurri', 20, 'GRAMO'],
      ],
    },
  },
  {
    nombre: 'Empanada de carne',
    categoria: 'Entradas',
    precio: 2500,
    descripcion: 'Cortada a cuchillo, al horno.',
    foto: 'empanada-de-carne.jpg',
  },
  {
    nombre: 'Bife de chorizo con papas',
    categoria: 'Principales',
    precio: 18000,
    descripcion: 'Bife de 400 g con papas fritas y salsa criolla.',
    foto: 'bife-de-chorizo-con-papas.jpg',
    receta: {
      rendimiento: 1,
      instrucciones: 'Sellar el bife a fuego fuerte; freír las papas en bastones.',
      lineas: [
        ['Carne vacuna', 400, 'GRAMO', 15],
        ['Papa', 300, 'GRAMO', 20],
        ['Aceite de oliva', 30, 'MILILITRO'],
        ['Sal', 5, 'GRAMO'],
        ['Salsa criolla', 80, 'GRAMO'],
      ],
    },
  },
  {
    nombre: 'Milanesa con puré',
    categoria: 'Principales',
    precio: 14000,
    descripcion: 'Milanesa de ternera con puré de papas.',
    foto: 'milanesa-con-pure.jpg',
  },
  {
    nombre: 'Flan casero',
    categoria: 'Postres',
    precio: 5500,
    descripcion: 'Con dulce de leche o crema.',
    foto: 'flan-casero.jpg',
    receta: {
      rendimiento: 4,
      instrucciones: 'Batir, colar y cocinar a baño María en el horno durante 50 minutos.',
      lineas: [
        ['Huevo', 4, 'UNIDAD'],
        ['Leche', 0.5, 'LITRO'],
        ['Azúcar', 150, 'GRAMO'],
      ],
    },
  },
  {
    nombre: 'Agua mineral',
    categoria: 'Bebidas',
    precio: 2000,
    descripcion: 'Botella de 500 ml, con o sin gas.',
    foto: 'agua-mineral.jpg',
    reventa: 'Agua mineral 500 ml',
  },
];

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

async function seedSalon(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  { capacidades, columnas, x0, pasoX }: SalonSeed,
): Promise<void> {
  for (const [i, capacidad] of capacidades.entries()) {
    const numero = i + 1;
    const posicion = {
      capacidad,
      posX: x0 + (i % columnas) * pasoX,
      posY: 15 + Math.floor(i / columnas) * 30,
      activa: true,
    };
    await tx.mesa.upsert({
      where: { sucursalId_numero: { sucursalId, numero } },
      update: posicion,
      create: { sucursalId, numero, ...posicion },
    });
  }
}

// Reemplaza la receta del dueño (plato o intermedio) por la del seed.
async function seedReceta(
  tx: Prisma.TransactionClient,
  dueno: { itemMenuId: string } | { productoIntermedioId: string },
  receta: RecetaSeed,
  componentes: Map<string, string>,
): Promise<void> {
  const datos = { rendimiento: receta.rendimiento, instrucciones: receta.instrucciones };
  const { id } = await tx.receta.upsert({
    where: dueno,
    update: datos,
    create: { ...dueno, ...datos },
  });
  await tx.lineaReceta.deleteMany({ where: { recetaId: id } });
  await tx.lineaReceta.createMany({
    data: receta.lineas.map(([componente, cantidad, unidad, merma = 0]) => ({
      recetaId: id,
      componenteId: componentes.get(componente)!,
      cantidad,
      unidad,
      porcentajeMerma: merma,
    })),
  });
}

async function seedComponente(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  datos: {
    nombre: string;
    tipo: 'INSUMO' | 'INTERMEDIO';
    unidadBase: UnidadBase;
    costoCompraVigente: number | null;
    llevaStock?: boolean;
  },
): Promise<string> {
  const existente = await tx.componenteInventario.findFirst({
    where: { restauranteId, nombre: datos.nombre },
  });
  // El costo vigente lo mueven los ingresos y las tandas: al volver a correr
  // el seed no se pisa.
  const { costoCompraVigente: _costo, ...sinCosto } = datos;
  const componente = existente
    ? await tx.componenteInventario.update({
        where: { id: existente.id },
        data: { ...sinCosto, activo: true },
      })
    : await tx.componenteInventario.create({ data: { restauranteId, ...datos } });
  return componente.id;
}

// Costo teórico por unidad base de una receta del seed, con los costos de compra del
// catálogo de insumos: es el costo vigente inicial de un intermedio que lleva stock.
function costoTeoricoDeSeed(nombre: string, unidadBase: UnidadBase, receta: RecetaSeed): number {
  const insumo = (n: string): Componente => {
    const datos = INSUMOS.find((i) => i.nombre === n)!;
    return {
      id: n,
      nombre: n,
      tipo: 'INSUMO',
      unidadBase: datos.unidadBase,
      activo: true,
      costoCompraVigente: datos.costo,
      llevaStock: false,
      receta: null,
    };
  };
  return costoTeorico({
    id: nombre,
    nombre,
    tipo: 'INTERMEDIO',
    unidadBase,
    activo: true,
    costoCompraVigente: null,
    llevaStock: true,
    receta: {
      rendimiento: receta.rendimiento,
      instrucciones: receta.instrucciones,
      lineas: receta.lineas.map(([componente, cantidad, unidad, merma = 0]) => ({
        componente: insumo(componente),
        cantidad,
        unidad,
        porcentajeMerma: merma,
      })),
    },
  });
}

async function seedMenuEInventario(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  sucursalIds: string[],
  adminId: string,
): Promise<string[]> {
  const categoriaIds = new Map<NombreCategoria, string>();
  for (const { nombre, requiereReceta, admiteObservaciones } of CATEGORIAS) {
    const categoria = await tx.categoria.upsert({
      where: { restauranteId_nombre: { restauranteId, nombre } },
      update: { requiereReceta, admiteObservaciones },
      create: { restauranteId, nombre, requiereReceta, admiteObservaciones },
    });
    categoriaIds.set(nombre, categoria.id);
  }

  const componentes = new Map<string, string>();
  for (const insumo of INSUMOS) {
    const id = await seedComponente(tx, restauranteId, {
      nombre: insumo.nombre,
      tipo: 'INSUMO',
      unidadBase: insumo.unidadBase,
      costoCompraVigente: insumo.costo,
    });
    componentes.set(insumo.nombre, id);

    // El stock es la suma de los movimientos: la existencia nace con un
    // INGRESO. Solo se crea una vez por sucursal, así que volver a correr el
    // seed no duplica.
    for (const sucursalId of sucursalIds) {
      const existencia = await tx.existencia.findUnique({
        where: { sucursalId_componenteId: { sucursalId, componenteId: id } },
      });
      if (existencia) continue;
      await tx.existencia.create({
        data: {
          sucursalId,
          componenteId: id,
          cantidadActual: insumo.stock,
          movimientos: {
            create: {
              tipo: 'INGRESO',
              cantidad: insumo.stock,
              costoUnitario: insumo.costo,
              motivo: 'Stock inicial',
              empleadoId: adminId,
            },
          },
        },
      });
    }
  }

  const salsaId = await seedComponente(tx, restauranteId, {
    nombre: 'Salsa criolla',
    tipo: 'INTERMEDIO',
    unidadBase: 'GRAMO',
    // Con stock, el intermedio nunca queda sin costo: arranca en el teórico de su receta.
    costoCompraVigente: redondearCosto(costoTeoricoDeSeed('Salsa criolla', 'GRAMO', SALSA_CRIOLLA)),
    llevaStock: true,
  });
  componentes.set('Salsa criolla', salsaId);
  await seedReceta(tx, { productoIntermedioId: salsaId }, SALSA_CRIOLLA, componentes);

  const chimichurriId = await seedComponente(tx, restauranteId, {
    nombre: 'Chimichurri',
    tipo: 'INTERMEDIO',
    unidadBase: 'GRAMO',
    costoCompraVigente: null,
  });
  componentes.set('Chimichurri', chimichurriId);
  await seedReceta(tx, { productoIntermedioId: chimichurriId }, CHIMICHURRI, componentes);

  const platoIds: string[] = [];
  for (const plato of PLATOS) {
    const datos = {
      categoriaId: categoriaIds.get(plato.categoria)!,
      precio: plato.precio,
      descripcion: plato.descripcion,
      fotoUrl: `/fotos-demo/${plato.foto}`,
      disponible: true,
      activo: true,
      insumoId: plato.reventa ? componentes.get(plato.reventa)! : null,
    };
    const existente = await tx.itemMenu.findFirst({
      where: { restauranteId, nombre: plato.nombre },
    });
    const item = existente
      ? await tx.itemMenu.update({ where: { id: existente.id }, data: datos })
      : await tx.itemMenu.create({ data: { restauranteId, nombre: plato.nombre, ...datos } });

    if (plato.receta) await seedReceta(tx, { itemMenuId: item.id }, plato.receta, componentes);
    else await tx.receta.deleteMany({ where: { itemMenuId: item.id } });
    platoIds.push(item.id);
  }
  return platoIds;
}

// "Carta principal" queda vigente y activa en Centro y en Palermo; "Menú de invierno" ya
// venció, para ver cómo se marca en el panel.
const MENUS = [
  {
    nombre: 'Carta principal',
    descripcion: 'La carta de todo el año.',
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: null,
  },
  {
    nombre: 'Menú de invierno',
    descripcion: 'Platos de olla y guisos.',
    vigenciaDesde: '2026-06-21',
    vigenciaHasta: '2026-09-20',
  },
] as const;

async function seedMenus(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  platoIds: string[],
): Promise<string> {
  const ids: string[] = [];
  for (const menu of MENUS) {
    const datos = {
      descripcion: menu.descripcion,
      vigenciaDesde: new Date(`${menu.vigenciaDesde}T00:00:00.000Z`),
      vigenciaHasta: menu.vigenciaHasta && new Date(`${menu.vigenciaHasta}T00:00:00.000Z`),
    };
    const existente = await tx.menu.findFirst({ where: { restauranteId, nombre: menu.nombre } });
    const fila = existente
      ? await tx.menu.update({ where: { id: existente.id }, data: datos })
      : await tx.menu.create({ data: { restauranteId, nombre: menu.nombre, ...datos } });
    await tx.menuItem.deleteMany({ where: { menuId: fila.id } });
    await tx.menuItem.createMany({
      data: platoIds.map((itemMenuId) => ({ menuId: fila.id, itemMenuId })),
    });
    ids.push(fila.id);
  }
  return ids[0]!;
}

// Programa de puntos ($1 = 0,01 punto) y un beneficio de cada tipo, vigentes
// por 60 días desde que corre el seed. Si un beneficio ya existe, no se toca:
// así un seed repetido no repone su stock ni le cambia la vigencia.
async function seedFidelizacion(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  cartaId: string,
): Promise<void> {
  await tx.programaFidelidad.upsert({
    where: { restauranteId },
    update: {},
    create: { restauranteId, puntosPorUnidad: 0.01 },
  });
  const grupo =
    (await tx.grupoBeneficios.findFirst({ where: { restauranteId, nombre: 'Bienvenida' } })) ??
    (await tx.grupoBeneficios.create({ data: { restauranteId, nombre: 'Bienvenida' } }));

  const vigenciaDesde = new Date();
  const vigenciaHasta = new Date(vigenciaDesde.getTime() + 60 * 24 * 60 * 60 * 1000);
  const beneficios = [
    {
      nombre: '2x1 de los martes',
      clase: 'PROMOCION',
      menuId: cartaId,
      tipoDescuento: 'PORCENTAJE',
      valor: 50,
      stockInicial: 20,
      stockDisponible: 20,
    },
    {
      nombre: 'Postre de regalo',
      clase: 'RECOMPENSA',
      criterioTipo: 'VISITAS',
      criterioValor: 3,
      tipoDescuento: 'MONTO_FIJO',
      valor: 3000,
    },
    {
      nombre: 'Canje de 500 puntos',
      clase: 'RECOMPENSA',
      criterioTipo: 'PUNTOS',
      criterioValor: 500,
      tipoDescuento: 'PORCENTAJE',
      valor: 15,
    },
    {
      nombre: 'Bienvenida',
      clase: 'RECOMPENSA',
      criterioTipo: 'NUEVO_CLIENTE',
      criterioValor: 1, // el DER lo exige en toda recompensa; este criterio no lo usa
      tipoDescuento: 'PORCENTAJE',
      valor: 10,
      grupoId: grupo.id,
    },
  ] as const satisfies Omit<
    Prisma.BeneficioUncheckedCreateInput,
    'restauranteId' | 'vigenciaDesde' | 'vigenciaHasta'
  >[];
  for (const beneficio of beneficios) {
    const existe = await tx.beneficio.findFirst({
      where: { restauranteId, nombre: beneficio.nombre },
    });
    if (!existe) {
      await tx.beneficio.create({
        data: { ...beneficio, restauranteId, vigenciaDesde, vigenciaHasta },
      });
    }
  }
}

// Modelos de demo (Kenney, CC0; ver modelos-demo/LICENCIA.md), ya a escala
// real. El resto de los platos queda sin modelo, para ver el menú sin "Ver en RA".
const MODELOS_RA = [
  { plato: 'Flan casero', archivo: 'flan.glb', porcionGramos: 120 },
  { plato: 'Bife de chorizo con papas', archivo: 'bife.glb', porcionGramos: 400 },
];

// Fuera de la transacción porque escribe archivos. Si el plato ya tiene su
// modelo y el archivo existe, lo deja como está.
async function seedModelosRa(restauranteId: string): Promise<void> {
  for (const modelo of MODELOS_RA) {
    const plato = await prisma.itemMenu.findFirstOrThrow({
      where: { restauranteId, nombre: modelo.plato },
      include: { modeloRa: true },
    });
    const actual = plato.modeloRa?.urlModelo;
    if (actual && existsSync(path.join(CARPETA_MODELOS, path.basename(actual)))) continue;

    const archivo = await readFile(path.join(__dirname, 'modelos-demo', modelo.archivo));
    const datos = {
      urlModelo: await guardarModelo(archivo, 'glb'),
      urlModeloIos: null,
      escalaReal: 1,
      porcionGramos: modelo.porcionGramos,
    };
    await prisma.modeloRA.upsert({
      where: { itemMenuId: plato.id },
      update: datos,
      create: { itemMenuId: plato.id, ...datos },
    });
    await borrarModelo(actual);
  }
}

// Tandas, ingresos, mermas y un conteo de la demo, con fechas de los últimos 7
// días. Va fuera de la transacción del seed porque usa el servicio y el
// repositorio reales (cada uno abre la suya), y las filas que necesita ya
// están confirmadas. Si la salsa ya tiene tandas en la sucursal, no se vuelve
// a cargar nada.
const COCINA_DE: Record<NombreSucursal, string> = {
  Centro: 'cocina@demo.pgim.test',
  Palermo: 'cocinero@demo.pgim.test',
};

const redondearCosto = (valor: number) => Math.round(valor * 10000) / 10000;
const haceDias = (dias: number, hora = 11) => {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  f.setHours(hora, 0, 0, 0);
  return f;
};

async function seedProduccionDemo(
  restauranteId: string,
  sucursalIds: Map<NombreSucursal, string>,
): Promise<void> {
  const filas = await prisma.componenteInventario.findMany({
    where: {
      restauranteId,
      nombre: { in: ['Salsa criolla', 'Tomate', 'Papa', 'Huevo', 'Cebolla'] },
    },
    select: { id: true, nombre: true },
  });
  const id = (nombre: string) => filas.find((f) => f.nombre === nombre)!.id;
  const salsaId = id('Salsa criolla');

  // El repositorio estampa la hora actual: se corrige con la fecha de la demo.
  const fecharUltimoMovimiento = async (sucursalId: string, componenteId: string, fecha: Date) => {
    const mov = await prisma.movimientoStock.findFirstOrThrow({
      where: { existencia: { sucursalId, componenteId } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    await prisma.movimientoStock.update({ where: { id: mov.id }, data: { fecha } });
  };

  for (const [nombreSucursal, sucursalId] of sucursalIds) {
    const yaCargada = await prisma.tandaProduccion.count({
      where: { sucursalId, intermedioId: salsaId },
    });
    if (yaCargada > 0) continue;

    const empleado = await prisma.usuario.findUniqueOrThrow({
      where: { email: COCINA_DE[nombreSucursal] },
    });
    const ctx = { restauranteId, sucursalId, empleadoId: empleado.id };

    // Dos compras de tomate a precio creciente: la segunda deja el costo vigente.
    for (const [dias, costo] of [
      [6, 2.7],
      [2, 3.1],
    ] as const) {
      await stockRepository.registrarMovimiento(ctx, {
        tipo: 'INGRESO',
        componenteId: id('Tomate'),
        cantidad: 2000,
        costoUnitario: costo,
        observacion: null,
      });
      await fecharUltimoMovimiento(sucursalId, id('Tomate'), haceDias(dias, 9));
    }

    // Tres tandas de 2 kg: dos normales y una que rinde menos con 10 % más de tomate.
    const tandas = [
      { dias: 6, obtenida: 1980, extraTomate: 1, observacion: undefined },
      { dias: 4, obtenida: 2000, extraTomate: 1, observacion: undefined },
      { dias: 2, obtenida: 1640, extraTomate: 1.1, observacion: 'Se pasó de cocción' },
    ];
    for (const t of tandas) {
      const catalogo = await recetaRepository.cargarCatalogo(restauranteId);
      const salsa = catalogo.get(salsaId)!;
      const teoricas = insumosNecesarios(salsa.receta!, 2000);
      const tanda = await produccionService.registrar(ctx, {
        intermedioId: salsaId,
        cantidadPlaneada: 2000,
        unidad: 'GRAMO',
        cantidadObtenida: t.obtenida,
        consumos: [...teoricas].map(([componenteId, teorica]) => ({
          componenteId,
          cantidad: teorica * (componenteId === id('Tomate') ? t.extraTomate : 1),
          // Los consumos van en la unidad base de cada componente.
          unidad: catalogo.get(componenteId)!.unidadBase,
        })),
        observacion: t.observacion,
      });
      await prisma.tandaProduccion.update({
        where: { id: tanda.id },
        data: { fecha: haceDias(t.dias) },
      });
      await prisma.movimientoStock.updateMany({
        where: { tandaId: tanda.id },
        data: { fecha: haceDias(t.dias) },
      });
    }

    // Mermas con motivos distintos; el costo es el vigente de cada componente.
    const catalogo = await recetaRepository.cargarCatalogo(restauranteId);
    const costoDe = (nombre: string) => redondearCosto(costoUnitario(catalogo.get(id(nombre))!));
    const mermas = [
      { nombre: 'Salsa criolla', cantidad: 150, motivoMerma: 'VENCIMIENTO', dias: 1 },
      { nombre: 'Papa', cantidad: 800, motivoMerma: 'DETERIORO', dias: 3 },
      { nombre: 'Huevo', cantidad: 6, motivoMerma: 'ERROR', dias: 5 },
      { nombre: 'Tomate', cantidad: 300, motivoMerma: 'PREPARACION', dias: 4 },
    ] as const;
    for (const m of mermas) {
      await stockRepository.registrarMovimiento(ctx, {
        tipo: 'MERMA',
        componenteId: id(m.nombre),
        cantidad: m.cantidad,
        costoUnitario: costoDe(m.nombre),
        motivoMerma: m.motivoMerma,
        observacion: null,
      });
      await fecharUltimoMovimiento(sucursalId, id(m.nombre), haceDias(m.dias, 17));
    }

    // Conteo de cebolla 250 g por debajo de lo que dice el sistema.
    const cebolla = await prisma.existencia.findUniqueOrThrow({
      where: { sucursalId_componenteId: { sucursalId, componenteId: id('Cebolla') } },
    });
    await stockRepository.registrarMovimiento(ctx, {
      tipo: 'AJUSTE',
      componenteId: id('Cebolla'),
      cantidadContada: Number(cebolla.cantidadActual) - 250,
      costoUnitario: costoDe('Cebolla'),
      motivo: 'Conteo de cierre',
    });
    await fecharUltimoMovimiento(sucursalId, id('Cebolla'), haceDias(1, 23));
  }
}

// Historial de ventas para el pronóstico (Hito 6B): Centro con 12 semanas y
// Palermo con 5, para mostrar el progreso. Termina ayer. Va fuera de la
// transacción de main() por el volumen. Se identifica por 20 comensales
// ficticios dedicados: se borra todo lo suyo y se vuelve a generar. No crea
// visitas, puntos, movimientos de stock ni comprobantes.
const SEMANAS_HISTORIAL: Record<NombreSucursal, number> = { Centro: 12, Palermo: 5 };
const CANTIDAD_COMENSALES_HISTORIAL = 20;
const LOTE = 2000;

async function insertarPorLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < filas.length; i += LOTE) await insertar(filas.slice(i, i + LOTE));
}

async function seedHistorialVentas(
  restauranteId: string,
  sucursalIds: Map<NombreSucursal, string>,
  passwordHash: string,
): Promise<number> {
  const emails = Array.from(
    { length: CANTIDAD_COMENSALES_HISTORIAL },
    (_, i) => `historial-${String(i + 1).padStart(2, '0')}@demo.test`,
  );
  const comensalIds: string[] = [];
  for (const [i, email] of emails.entries()) {
    // Inactivos: no son para iniciar sesión.
    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash, tipo: 'COMENSAL', activo: false },
    });
    await prisma.comensal.upsert({
      where: { usuarioId: usuario.id },
      update: {},
      create: { usuarioId: usuario.id, nombre: `Comensal de historial ${i + 1}` },
    });
    comensalIds.push(usuario.id);
  }

  const deHistorial = { in: comensalIds };
  await prisma.$transaction(async (tx) => {
    const cuenta = { reserva: { comensalId: deHistorial } };
    await tx.pago.deleteMany({ where: { comensalId: deHistorial } });
    await tx.lineaPedido.deleteMany({ where: { pedido: { cuentaMesa: cuenta } } });
    await tx.pedido.deleteMany({ where: { cuentaMesa: cuenta } });
    await tx.cuentaMesa.deleteMany({ where: cuenta });
    await tx.reserva.deleteMany({ where: { comensalId: deHistorial } });
  });

  const hoy = new Date();
  let total = 0;
  for (const [indice, [nombre, sucursalId]] of [...sucursalIds].entries()) {
    // Lecturas con orden fijo: alimentan al generador pseudoaleatorio y el
    // historial tiene que salir igual en cada corrida.
    const mesas = await prisma.mesa.findMany({
      where: { sucursalId, sucursal: { restauranteId }, activa: true },
      select: { id: true, numero: true, capacidad: true },
      orderBy: { numero: 'asc' },
    });
    const horarios = await prisma.horarioServicio.findMany({
      where: { sucursalId, sucursal: { restauranteId } },
      orderBy: { horaInicio: 'asc' },
    });
    // Platos activos del menú activo de la sucursal (misma condición que el
    // historial que lee el pronóstico).
    const platos = (
      await prisma.itemMenu.findMany({
        where: {
          restauranteId,
          activo: true,
          menus: {
            some: { menu: { sucursalesActivas: { some: { id: sucursalId, restauranteId } } } },
          },
        },
        select: { id: true, precio: true },
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      })
    ).map((p) => ({ id: p.id, precio: Number(p.precio) }));
    const ultimo = await prisma.pedido.aggregate({
      where: { sucursalId },
      _max: { numero: true },
    });
    const reservas = generarReservasHistorial({
      semilla: SEMILLA_HISTORIAL + indice,
      hoy,
      semanas: SEMANAS_HISTORIAL[nombre],
      mesas,
      horarios: horarios.map((h) => ({
        franja: h.franja as Franja,
        horaInicio: aHora(h.horaInicio),
        horaFin: aHora(h.horaFin),
      })),
      platos,
    });

    // Los números siguen al máximo que quedó después del borrado.
    let numero = ultimo._max.numero ?? 0;
    const filas = {
      reserva: [] as Prisma.ReservaCreateManyInput[],
      cuenta: [] as Prisma.CuentaMesaCreateManyInput[],
      pedido: [] as Prisma.PedidoCreateManyInput[],
      linea: [] as Prisma.LineaPedidoCreateManyInput[],
      pago: [] as Prisma.PagoCreateManyInput[],
    };
    for (const [i, r] of reservas.entries()) {
      const comensalId = comensalIds[i % comensalIds.length]!;
      const reservaId = randomUUID();
      const cuentaMesaId = randomUUID();
      const pedidoId = randomUUID();
      const minutos = (m: number) => new Date(r.inicio.getTime() + m * 60_000);
      const monto = r.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
      filas.reserva.push({
        id: reservaId,
        sucursalId,
        mesaId: r.mesaId,
        comensalId,
        inicio: r.inicio,
        cantidadPersonas: r.cantidadPersonas,
        modoAsignacion: 'AUTOMATICA',
        estado: 'FINALIZADA',
      });
      filas.cuenta.push({
        id: cuentaMesaId,
        reservaId,
        abiertaEn: r.inicio,
        cerradaEn: minutos(75),
        estado: 'CERRADA',
      });
      filas.pedido.push({
        id: pedidoId,
        cuentaMesaId,
        sucursalId,
        numero: ++numero,
        creadoEn: minutos(5),
        listoEn: minutos(25),
        estado: 'ENTREGADO',
      });
      for (const l of r.lineas) {
        filas.linea.push({
          pedidoId,
          itemMenuId: l.itemMenuId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        });
      }
      filas.pago.push({
        cuentaMesaId,
        comensalId,
        monto,
        metodo: i % 3 === 0 ? 'BILLETERA_VIRTUAL' : 'TARJETA',
        estado: 'APROBADO',
        fecha: minutos(70),
      });
    }
    await prisma.$transaction(
      async (tx) => {
        await insertarPorLotes(filas.reserva, (data) => tx.reserva.createMany({ data }));
        await insertarPorLotes(filas.cuenta, (data) => tx.cuentaMesa.createMany({ data }));
        await insertarPorLotes(filas.pedido, (data) => tx.pedido.createMany({ data }));
        await insertarPorLotes(filas.linea, (data) => tx.lineaPedido.createMany({ data }));
        await insertarPorLotes(filas.pago, (data) => tx.pago.createMany({ data }));
      },
      { timeout: 60_000 },
    );
    total += reservas.length;
  }
  return total;
}

// Faltantes de la demo del simulador en Centro (Hito 7). Se converge a un
// estado fijo, así que volver a correr el seed no agrega nada:
// - stock: todo con holgura para la semana, salvo el queso provolone, que no alcanza;
// - capacidad: reservas pendientes del sábado a la noche de la semana próxima que
//   superan lo que entra en las mesas (con una mesa reservada dos veces);
// - plantel: el de EMPLEADOS, que deja un faltante en los picos;
// - turnos: la semana en curso ya confirmada, para que "Mis turnos" tenga contenido.
// La planificación en borrador de la semana próxima se descarta para que el
// asistente la vuelva a armar con estos datos. Las mermas con motivo ya las
// carga seedProduccionDemo, dentro de los últimos 7 días.
const STOCK_PROVOLONE_DEMO = 15000;
const STOCK_HOLGADO = { GRAMO: 150000, MILILITRO: 150000, UNIDAD: 1000 } as const;
const EMAIL_RESERVAS_DEMO = 'reservas-demo@demo.test';

async function seedFaltantesSimulador(
  restauranteId: string,
  sucursalId: string,
  passwordHash: string,
): Promise<void> {
  const empleado = await prisma.usuario.findUniqueOrThrow({
    where: { email: COCINA_DE.Centro },
  });
  const ctx = { restauranteId, sucursalId, empleadoId: empleado.id };

  const catalogo = await recetaRepository.cargarCatalogo(restauranteId);
  const existencias = await prisma.existencia.findMany({
    where: { sucursalId, sucursal: { restauranteId } },
    select: { cantidadActual: true, componente: { select: { id: true, nombre: true } } },
    orderBy: { componente: { nombre: 'asc' } },
  });
  for (const { cantidadActual, componente } of existencias) {
    const c = catalogo.get(componente.id)!;
    const escaso = componente.nombre === 'Queso provolone';
    const objetivo = escaso ? STOCK_PROVOLONE_DEMO : STOCK_HOLGADO[c.unidadBase];
    if (Number(cantidadActual) === objetivo) continue;
    await stockRepository.registrarMovimiento(ctx, {
      tipo: 'AJUSTE',
      componenteId: componente.id,
      cantidadContada: objetivo,
      costoUnitario: redondearCosto(costoUnitario(c)),
      motivo: escaso ? 'Conteo de la semana' : 'Reposición para la semana',
    });
  }

  // Reservas pendientes del sábado a la noche: cuatro turnos de una hora con
  // todas las mesas llenas y un grupo de cuatro más que los lugares de la mesa más grande.
  const comensal = await prisma.usuario.upsert({
    where: { email: EMAIL_RESERVAS_DEMO },
    update: {},
    create: { email: EMAIL_RESERVAS_DEMO, passwordHash, tipo: 'COMENSAL', activo: false },
  });
  await prisma.comensal.upsert({
    where: { usuarioId: comensal.id },
    update: {},
    create: { usuarioId: comensal.id, nombre: 'Reservas de la demo' },
  });
  await prisma.reserva.deleteMany({ where: { comensalId: comensal.id } });
  const mesas = await prisma.mesa.findMany({
    where: { sucursalId, sucursal: { restauranteId }, activa: true },
    select: { id: true, capacidad: true },
    orderBy: { numero: 'asc' },
  });
  const { desde: lunesProximo, fechas } = semanaSiguiente(new Date());
  const inicios = iniciosDelDia(fechas[5]!, '20:00', '00:00');
  const grande = mesas.reduce((a, m) => (m.capacidad > a.capacidad ? m : a));
  const reservas: Prisma.ReservaCreateManyInput[] = inicios.flatMap((inicio) =>
    mesas.map((m) => ({
      sucursalId,
      mesaId: m.id,
      comensalId: comensal.id,
      inicio,
      // La mesa más grande, a las 21, recibe un grupo de cuatro más que sus lugares.
      cantidadPersonas:
        m.id === grande.id && inicio.getTime() === inicios[1]!.getTime()
          ? m.capacidad + 4
          : m.capacidad,
      modoAsignacion: 'MANUAL' as const,
      estado: 'PENDIENTE' as const,
    })),
  );
  await prisma.reserva.createMany({ data: reservas });

  // Semana próxima: se descarta el borrador (nunca uno confirmado). Las alertas
  // y los turnos se van con la planificación.
  await prisma.planificacionTurnos.deleteMany({
    where: { sucursalId, estado: 'BORRADOR', semanaDesde: new Date(`${lunesProximo}T00:00:00Z`) },
  });

  // Semana en curso, confirmada: los mozos rotan entre almuerzo y cena.
  const lunesActual = sumarDias(lunesProximo, -7);
  const semana = new Date(`${lunesActual}T00:00:00Z`);
  const yaConfirmada = await prisma.planificacionTurnos.count({
    where: { sucursalId, semanaDesde: semana },
  });
  if (yaConfirmada > 0) return;
  const plantel = async (rol: 'Mozo' | 'Cocinero') =>
    (
      await prisma.empleado.findMany({
        where: { restauranteId, rol: { nombre: rol }, sucursales: { some: { sucursalId } } },
        select: { usuarioId: true },
        orderBy: { nombreCompleto: 'asc' },
      })
    ).map((e) => e.usuarioId);
  const mozos = await plantel('Mozo');
  const cocineros = await plantel('Cocinero');
  const turnos: Prisma.TurnoCreateManyPlanificacionInput[] = [];
  for (let d = 0; d < 7; d++) {
    const fecha = new Date(`${sumarDias(lunesActual, d)}T00:00:00Z`);
    for (const [franja, desfase] of [
      ['ALMUERZO', 0],
      ['CENA', 2],
    ] as const) {
      for (let k = 0; k < 2; k++) {
        turnos.push({
          empleadoId: mozos[(d + desfase + k) % mozos.length]!,
          sucursalId,
          fecha,
          franja,
        });
      }
      turnos.push({
        empleadoId: cocineros[(d + desfase / 2) % cocineros.length]!,
        sucursalId,
        fecha,
        franja,
      });
    }
  }
  await prisma.planificacionTurnos.create({
    data: {
      sucursalId,
      semanaDesde: semana,
      estado: 'CONFIRMADA',
      confirmadaEn: new Date(),
      turnos: { create: turnos },
    },
  });
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD_DEMO);

  const { restauranteId, sucursalIds } = await prisma.$transaction(async (tx) => {
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

      await tx.horarioServicio.deleteMany({ where: { sucursalId: sucursal.id } });
      await tx.horarioServicio.createMany({
        data: HORARIOS_SERVICIO.map((h) => ({ sucursalId: sucursal.id, ...h })),
      });

      await seedSalon(tx, sucursal.id, SALONES[nombre]);

      // Solo se crea: una configuración editada no se pisa al volver a correr el seed.
      await tx.configuracionApertura.upsert({
        where: { sucursalId: sucursal.id },
        update: {},
        create: { sucursalId: sucursal.id, ...CONFIGURACION_APERTURA_POR_DEFECTO },
      });
    }

    const rolIds = await crearRolesPredeterminados(tx, restaurante.id);
    for (const rol of ROLES_STAFF) {
      rolIds.set(rol.nombre, await upsertRol(tx, restaurante.id, rol, false, permisoIds));
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

    const admin = await tx.usuario.findUniqueOrThrow({ where: { email: 'admin@demo.pgim.test' } });
    const platoIds = await seedMenuEInventario(
      tx,
      restaurante.id,
      [...sucursalIds.values()],
      admin.id,
    );
    const cartaId = await seedMenus(tx, restaurante.id, platoIds);
    // Las dos sucursales usan la carta: el historial de ventas sale de ella.
    await tx.sucursal.updateMany({
      where: { id: { in: [...sucursalIds.values()] } },
      data: { menuActivoId: cartaId },
    });
    await seedFidelizacion(tx, restaurante.id, cartaId);

    for (const { email, nombre } of COMENSALES) {
      const comensal = await tx.usuario.upsert({
        where: { email },
        update: { passwordHash, activo: true },
        create: { email, passwordHash, tipo: 'COMENSAL' },
      });
      await tx.comensal.upsert({
        where: { usuarioId: comensal.id },
        update: { nombre },
        create: { usuarioId: comensal.id, nombre },
      });
    }
    return { restauranteId: restaurante.id, sucursalIds };
  });
  await seedModelosRa(restauranteId);
  await seedProduccionDemo(restauranteId, sucursalIds);
  const reservasHistorial = await seedHistorialVentas(restauranteId, sucursalIds, passwordHash);
  await seedFaltantesSimulador(restauranteId, sucursalIds.get('Centro')!, passwordHash);

  const [permisos, roles, sucursales, usuarios, componentes, platos, movimientos, tandas] =
    await Promise.all([
      prisma.permiso.count(),
      prisma.rol.count(),
      prisma.sucursal.count(),
      prisma.usuario.count(),
      prisma.componenteInventario.count(),
      prisma.itemMenu.count(),
      prisma.movimientoStock.count(),
      prisma.tandaProduccion.count(),
    ]);
  console.log(
    `Seed listo: ${permisos} permisos, ${roles} roles, ${sucursales} sucursales, ${usuarios} usuarios, ` +
      `${componentes} componentes, ${platos} platos, ${movimientos} movimientos, ${tandas} tandas, ${reservasHistorial} reservas de historial (contraseña: ${PASSWORD_DEMO}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
