import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifica la contraseña con la que se generó el hash', async () => {
    const hash = await hashPassword('demo1234');

    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword('demo1234', hash)).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta o un hash mal formado', async () => {
    const hash = await hashPassword('demo1234');

    await expect(verifyPassword('otra', hash)).resolves.toBe(false);
    await expect(verifyPassword('demo1234', 'no-es-un-hash')).resolves.toBe(false);
  });
});
