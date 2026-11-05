import type { CuentaComensalInput, CuentaEmpleadoInput, CuentaUsuario } from '@pgim/shared';
import * as archivosFoto from '../lib/archivos-foto';
import { AppError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { cuentaRepository, type CuentaRepository } from '../repositories/cuenta.repository';

export type ArchivosFoto = Pick<typeof archivosFoto, 'validarFoto' | 'guardarFoto' | 'borrarFoto'>;

const NO_EXISTE = 'La cuenta no existe';

// CU-20. El usuarioId siempre viene de la sesión. Los datos del empleado se
// resuelven con su restauranteId; con restauranteId null se trata de un comensal.
export function createCuentaService(repo: CuentaRepository, fotos: ArchivosFoto = archivosFoto) {
  async function obtener(usuarioId: string, restauranteId: string | null): Promise<CuentaUsuario> {
    if (restauranteId === null) {
      const comensal = await repo.findComensal(usuarioId);
      if (!comensal) throw new AppError(404, NO_EXISTE);
      return { tipo: 'COMENSAL', ...comensal };
    }
    const empleado = await repo.findEmpleado(usuarioId, restauranteId);
    if (!empleado) throw new AppError(404, NO_EXISTE);
    return { tipo: 'EMPLEADO', ...empleado };
  }

  return {
    obtener,

    async actualizarComensal(usuarioId: string, datos: CuentaComensalInput) {
      const telefono = datos.telefono?.trim() || null;
      if (!(await repo.actualizarComensal(usuarioId, { nombre: datos.nombre, telefono }))) {
        throw new AppError(404, NO_EXISTE);
      }
      return obtener(usuarioId, null);
    },

    async actualizarEmpleado(usuarioId: string, restauranteId: string, datos: CuentaEmpleadoInput) {
      if (!(await repo.actualizarEmpleado(usuarioId, restauranteId, datos))) {
        throw new AppError(404, NO_EXISTE);
      }
      return obtener(usuarioId, restauranteId);
    },

    // Reemplaza la foto propia y borra la subida anterior.
    async subirFoto(usuarioId: string, restauranteId: string, archivo: Buffer) {
      const formato = fotos.validarFoto(archivo);
      const anterior = await repo.findFotoEmpleado(usuarioId, restauranteId);
      const url = await fotos.guardarFoto(archivo, formato);
      try {
        if (!(await repo.guardarFotoEmpleado(usuarioId, restauranteId, url))) {
          throw new AppError(404, NO_EXISTE);
        }
      } catch (e) {
        await fotos.borrarFoto(url);
        throw e;
      }
      await fotos.borrarFoto(anterior);
      return { fotoUrl: url };
    },

    // No cierra sesiones: el token no depende de la contraseña.
    async cambiarContrasena(usuarioId: string, actual: string, nueva: string): Promise<void> {
      const hash = await repo.findPasswordHash(usuarioId);
      if (!hash) throw new AppError(404, NO_EXISTE);
      if (!(await verifyPassword(actual, hash))) {
        throw new AppError(400, 'La contraseña actual no es correcta');
      }
      await repo.guardarPasswordHash(usuarioId, await hashPassword(nueva));
    },
  };
}

export const cuentaService = createCuentaService(cuentaRepository);
