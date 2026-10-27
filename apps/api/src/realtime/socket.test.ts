import { cookieDeComensal } from '../test/sesion-falsa';
import { salasDeSesion, sesionDeCookie } from './socket';
import type { CodigoPermiso, Sesion } from '@pgim/shared';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

describe('sesionDeCookie', () => {
  it.each([
    ['sin cookie', undefined],
    ['sin la cookie de sesión', 'otra=1'],
    ['con un token inválido', 'sesion=basura'],
  ])('%s da null', async (_, cookie) => {
    expect(await sesionDeCookie(cookie)).toBeNull();
  });

  it('con la cookie de sesión resuelve la sesión', async () => {
    const sesion = await sesionDeCookie(cookieDeComensal());
    expect(sesion?.usuario.tipo).toBe('COMENSAL');
  });

  it('encuentra la cookie entre otras', async () => {
    const sesion = await sesionDeCookie(`a=1; ${cookieDeComensal()}; b=2`);
    expect(sesion?.usuario.tipo).toBe('COMENSAL');
  });
});

describe('salasDeSesion', () => {
  const personal = (permisos: CodigoPermiso[]) =>
    ({
      usuario: { id: 'U', tipo: 'EMPLEADO' },
      permisos,
      sucursalActiva: { id: 'S' },
    }) as unknown as Sesion;

  it('el comensal solo entra a su sala', () => {
    const sesion = { usuario: { id: 'C', tipo: 'COMENSAL' }, permisos: [] } as unknown as Sesion;
    expect(salasDeSesion(sesion)).toEqual(['comensal:C']);
  });

  it('el personal con pedido.ver o stock.registrar entra a la sala del personal', () => {
    expect(salasDeSesion(personal(['pedido.ver']))).toEqual(['sucursal:S', 'personal:S']);
    expect(salasDeSesion(personal(['stock.registrar']))).toEqual(['sucursal:S', 'personal:S']);
  });

  it('el personal sin esos permisos no entra a la sala del personal', () => {
    expect(salasDeSesion(personal(['reserva.ver']))).toEqual(['sucursal:S']);
  });
});
