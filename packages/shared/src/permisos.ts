// Catálogo de permisos del sistema y permisos por defecto de los roles
// predeterminados. Lo usan la API (middleware de permiso, alta de restaurante y
// seed) y la web (qué pantallas mostrar).

const ACCIONES_ABM = ['ver', 'crear', 'editar', 'eliminar'] as const;

const MODULOS_ABM = [
  'sucursal',
  'rol',
  'personal',
  'menu',
  'beneficio',
  'insumo',
  'receta',
] as const;

const PERMISOS_OPERATIVOS = [
  'reserva.ver',
  'reserva.activar',
  'turno.ver',
  'turno.planificar',
  'apertura.consultar',
  'metrica.ver',
  'stock.registrar',
  'pedido.ver',
  'pedido.gestionar_cola',
  'pedido.avanzar',
  'mesa.cerrar',
  'pago.ver',
] as const;

type ModuloAbm = (typeof MODULOS_ABM)[number];
type AccionAbm = (typeof ACCIONES_ABM)[number];

export type CodigoPermiso = `${ModuloAbm}.${AccionAbm}` | (typeof PERMISOS_OPERATIVOS)[number];

export interface Permiso {
  codigo: CodigoPermiso;
  modulo: string;
  accion: string;
}

function abm(modulo: ModuloAbm): CodigoPermiso[] {
  return ACCIONES_ABM.map((accion) => `${modulo}.${accion}` as const);
}

export const CODIGOS_PERMISO: readonly CodigoPermiso[] = [
  ...MODULOS_ABM.flatMap(abm),
  ...PERMISOS_OPERATIVOS,
];

export const PERMISOS: readonly Permiso[] = CODIGOS_PERMISO.map((codigo) => {
  const [modulo, accion] = codigo.split('.') as [string, string];
  return { codigo, modulo, accion };
});

export type Arquetipo = 'MOZO' | 'COCINERO' | 'OTRO';

export interface RolPredeterminado {
  nombre: string;
  arquetipo: Arquetipo;
  permisos: readonly CodigoPermiso[];
}

// Permisos por defecto según la matriz de actores del Anexo (sección 4.1): quien
// opera o consulta un módulo recibe también su permiso de lectura.
export const ROLES_PREDETERMINADOS: readonly RolPredeterminado[] = [
  {
    nombre: 'Administrador',
    arquetipo: 'OTRO',
    permisos: CODIGOS_PERMISO,
  },
  {
    nombre: 'Gerente de sucursal',
    arquetipo: 'OTRO',
    permisos: [
      'sucursal.ver',
      'rol.ver',
      'personal.ver',
      'reserva.ver',
      'reserva.activar',
      'mesa.cerrar',
      'pedido.ver',
      'pago.ver',
      'beneficio.ver',
      'menu.ver',
      'insumo.ver',
      'receta.ver',
      'turno.planificar',
      'apertura.consultar',
      'metrica.ver',
    ],
  },
  {
    nombre: 'Jefe de cocina',
    arquetipo: 'COCINERO',
    permisos: [
      ...abm('menu'),
      ...abm('insumo'),
      ...abm('receta'),
      'stock.registrar',
      'pedido.ver',
      'pedido.gestionar_cola',
      'pedido.avanzar',
      'apertura.consultar',
    ],
  },
];
