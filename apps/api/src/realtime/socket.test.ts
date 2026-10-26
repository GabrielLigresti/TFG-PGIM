import { cookieDeComensal } from '../test/sesion-falsa';
import { sesionDeCookie } from './socket';

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
