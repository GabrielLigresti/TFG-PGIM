import {
  PERMISOS,
  gestionaRoles as tienePermisosDeGestion,
  type GrupoPermisos,
  type Rol,
  type RolInput,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { rolRepository, type RolRepository } from '../repositories/rol.repository';
import { verificarGestorDeRoles } from './gestion-roles';

// Catálogo agrupado por módulo, para el formulario de roles (Permiso.listarPorModulo).
function permisosPorModulo(): GrupoPermisos[] {
  const grupos = new Map<string, GrupoPermisos>();
  for (const { codigo, modulo, accion } of PERMISOS) {
    const grupo = grupos.get(modulo) ?? { modulo, permisos: [] };
    grupo.permisos.push({ codigo, accion });
    grupos.set(modulo, grupo);
  }
  return [...grupos.values()];
}

export function createRolService(repo: RolRepository) {
  async function obtener(restauranteId: string, id: string): Promise<Rol> {
    const rol = await repo.buscar(restauranteId, id);
    if (!rol) throw new AppError(404, 'El rol no existe');
    return rol;
  }

  // E1: nombre único dentro del restaurante.
  async function verificarNombre(restauranteId: string, nombre: string, excluirId?: string) {
    if (await repo.existeNombre(restauranteId, nombre, excluirId)) {
      throw new AppError(409, `Ya existe un rol llamado "${nombre}"`);
    }
  }

  // Flujo B: un rol con empleados activos no se da de baja hasta reasignarlos.
  function verificarSinEmpleados(rol: Rol) {
    if (rol.cantidadEmpleados > 0) {
      throw new AppError(
        409,
        `El rol "${rol.nombre}" tiene ${rol.cantidadEmpleados} empleado(s) activo(s): reasignalos a otro rol antes de darlo de baja`,
      );
    }
  }

  const gestionaRoles = (rol: Rol) => rol.activo && tienePermisosDeGestion(rol.permisos);

  return {
    listar: (restauranteId: string) => repo.listar(restauranteId),

    permisosPorModulo,

    async crear(restauranteId: string, datos: RolInput) {
      await verificarNombre(restauranteId, datos.nombre);
      return repo.crear(restauranteId, datos);
    },

    async actualizar(restauranteId: string, id: string, datos: RolInput) {
      const actual = await obtener(restauranteId, id);
      await verificarNombre(restauranteId, datos.nombre, id);

      const seDesactiva = actual.activo && datos.activo === false;
      if (seDesactiva) verificarSinEmpleados(actual);

      // E2: el cambio no puede dejar al restaurante sin nadie que gestione roles.
      const sigueGestionando = datos.activo !== false && tienePermisosDeGestion(datos.permisos);
      if (gestionaRoles(actual) && !sigueGestionando) {
        await verificarGestorDeRoles(repo.contarGestoresDeRoles, restauranteId, { rolId: id });
      }
      return repo.actualizar(restauranteId, id, datos);
    },

    async desactivar(restauranteId: string, id: string) {
      const actual = await obtener(restauranteId, id);
      if (!actual.activo) return;
      verificarSinEmpleados(actual);
      if (gestionaRoles(actual)) {
        await verificarGestorDeRoles(repo.contarGestoresDeRoles, restauranteId, { rolId: id });
      }
      await repo.desactivar(restauranteId, id);
    },
  };
}

export const rolService = createRolService(rolRepository);
