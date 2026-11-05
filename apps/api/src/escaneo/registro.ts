import { env } from '../config/env';
import { AppError } from '../lib/errors';
import type { Proveedor3D } from './proveedor-3d';
import { ProveedorSimulado } from './proveedor-simulado';

export interface RegistroProveedores {
  // El que se usa para los escaneos nuevos.
  activo(): Proveedor3D;
  // Un escaneo en curso sigue con el proveedor con el que empezó.
  buscar(nombre: string): Proveedor3D;
}

export function crearRegistro(proveedores: Proveedor3D[], activo: string): RegistroProveedores {
  const porNombre = new Map(proveedores.map((p) => [p.nombre, p]));
  if (!porNombre.has(activo)) {
    throw new Error(`El proveedor 3D "${activo}" no está registrado`);
  }
  return {
    activo: () => porNombre.get(activo)!,
    buscar(nombre) {
      const proveedor = porNombre.get(nombre);
      if (!proveedor) throw new AppError(500, `Proveedor 3D desconocido: ${nombre}`);
      return proveedor;
    },
  };
}

export const registroProveedores: RegistroProveedores = crearRegistro(
  [new ProveedorSimulado({ demoraMs: env.SIMULADO_DEMORA_MS, fallar: env.SIMULADO_FALLA })],
  env.PROVEEDOR_3D,
);
