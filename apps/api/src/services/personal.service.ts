import {
  administraModulo,
  type CodigoPermiso,
  gestionaRoles as tienePermisosDeGestion,
  type Empleado,
  type EmpleadoAlta,
  type EmpleadoEdicion,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { hashPassword } from '../lib/password';
import {
  personalRepository,
  type PersonalRepository,
  type RolAsignable,
} from '../repositories/personal.repository';
import { verificarGestorDeRoles } from './gestion-roles';

const gestionaRoles = (rol: RolAsignable) => rol.activo && tienePermisosDeGestion(rol.permisos);

export function createPersonalService(repo: PersonalRepository) {
  async function obtener(restauranteId: string, usuarioId: string): Promise<Empleado> {
    const empleado = await repo.buscar(restauranteId, usuarioId);
    if (!empleado) throw new AppError(404, 'El empleado no existe');
    return empleado;
  }

  async function obtenerRolActivo(restauranteId: string, rolId: string): Promise<RolAsignable> {
    const rol = await repo.buscarRol(restauranteId, rolId);
    if (!rol) throw new AppError(404, 'El rol no existe');
    if (!rol.activo) throw new AppError(409, 'El rol elegido está dado de baja');
    return rol;
  }

  // Las sucursales nuevas tienen que estar activas; una asignación que ya tenía
  // se conserva aunque la sucursal se haya dado de baja después.
  async function verificarSucursales(
    restauranteId: string,
    ids: string[],
    actuales: string[] = [],
  ) {
    const unicas = [...new Set(ids)];
    const nuevas = unicas.filter((id) => !actuales.includes(id));
    if ((await repo.contarSucursalesActivas(restauranteId, nuevas)) !== nuevas.length) {
      throw new AppError(409, 'Alguna de las sucursales no existe o está dada de baja');
    }
    return unicas;
  }

  function verificarNoEsElMismo(usuarioActualId: string, usuarioId: string) {
    if (usuarioActualId === usuarioId) {
      throw new AppError(409, 'No podés darte de baja a vos mismo');
    }
  }

  // E2 del CU-02 aplicada al personal: cambiarle el rol o dar de baja a un
  // empleado no puede dejar al restaurante sin nadie que gestione roles.
  async function verificarGestion(
    restauranteId: string,
    actual: Empleado,
    sigueGestionando: boolean,
  ) {
    if (!actual.activo || sigueGestionando) return;
    const rolActual = await repo.buscarRol(restauranteId, actual.rol.id);
    if (rolActual && gestionaRoles(rolActual)) {
      await verificarGestorDeRoles(repo.contarGestoresDeRoles, restauranteId, {
        usuarioId: actual.id,
      });
    }
  }

  return {
    // Quien administra el personal ve a todos; quien solo lo ve, a los que
    // comparten alguna sucursal con él.
    listar(restauranteId: string, permisos: readonly CodigoPermiso[], asignadas: string[]) {
      return administraModulo(permisos, 'personal')
        ? repo.listar(restauranteId)
        : repo.listar(restauranteId, asignadas);
    },

    opciones: (restauranteId: string) => repo.opciones(restauranteId),

    async crear(restauranteId: string, datos: EmpleadoAlta) {
      if (await repo.emailRegistrado(datos.email)) {
        throw new AppError(409, 'Ya existe una cuenta con ese email');
      }
      await obtenerRolActivo(restauranteId, datos.rolId);
      const sucursalIds = await verificarSucursales(restauranteId, datos.sucursalIds);
      const { password, ...resto } = datos;
      return repo.crear(restauranteId, { ...resto, sucursalIds }, await hashPassword(password));
    },

    async actualizar(
      restauranteId: string,
      usuarioActualId: string,
      usuarioId: string,
      datos: EmpleadoEdicion,
    ) {
      const actual = await obtener(restauranteId, usuarioId);
      if (datos.activo === false) verificarNoEsElMismo(usuarioActualId, usuarioId);
      const rolNuevo = await obtenerRolActivo(restauranteId, datos.rolId);
      const sucursalIds = await verificarSucursales(
        restauranteId,
        datos.sucursalIds,
        actual.sucursales.map((s) => s.id),
      );
      await verificarGestion(
        restauranteId,
        actual,
        datos.activo !== false && gestionaRoles(rolNuevo),
      );

      const { password, ...resto } = datos;
      return repo.actualizar(
        restauranteId,
        usuarioId,
        { ...resto, sucursalIds },
        password ? await hashPassword(password) : undefined,
      );
    },

    async desactivar(restauranteId: string, usuarioActualId: string, usuarioId: string) {
      verificarNoEsElMismo(usuarioActualId, usuarioId);
      const actual = await obtener(restauranteId, usuarioId);
      await verificarGestion(restauranteId, actual, false);
      await repo.desactivar(restauranteId, usuarioId);
    },
  };
}

export const personalService = createPersonalService(personalRepository);
