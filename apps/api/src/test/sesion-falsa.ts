import type { CodigoPermiso } from '@pgim/shared';
import { firmarToken } from '../lib/jwt';
import type { UsuarioSesion } from '../repositories/usuario.repository';
import { IDS } from './fake-usuarios';

// Para tests de rutas: el archivo de test mockea usuario.repository con
//   jest.mock('../repositories/usuario.repository', () => ({
//     usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
//   }));
// y esta función hace que la sesión tenga los permisos pedidos.
export function cookieConPermisos(permisos: CodigoPermiso[]): string {
  const { usuarioRepository } = jest.requireMock('../repositories/usuario.repository');
  const sesion: UsuarioSesion = {
    id: IDS.admin,
    email: 'admin@demo.test',
    tipo: 'EMPLEADO',
    activo: true,
    comensal: null,
    empleado: {
      nombreCompleto: 'Admin',
      restaurante: { id: IDS.restaurante, nombre: 'Demo' },
      rol: { id: IDS.rol, nombre: 'Rol' },
      permisos,
      sucursales: [{ id: IDS.centro, nombre: 'Centro' }],
    },
  };
  usuarioRepository.findSesionById.mockResolvedValue(sesion);
  return `sesion=${firmarToken({ usuarioId: IDS.admin, sucursalId: IDS.centro })}`;
}
