import { OAuth2Client } from 'google-auth-library';
import { crearVerificadorGoogle } from './google';

jest.mock('google-auth-library');

const verifyIdToken = jest.fn();

beforeEach(() => {
  verifyIdToken.mockReset();
  (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({ verifyIdToken }));
});

const conPayload = (payload: object) =>
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });

describe('crearVerificadorGoogle', () => {
  it('devuelve null si no hay client ID', () => {
    expect(crearVerificadorGoogle(undefined)).toBeNull();
  });

  it('devuelve la identidad con el email en minúsculas', async () => {
    conPayload({ sub: 's1', email: 'Ana@Gmail.com', email_verified: true, name: 'Ana' });
    const v = crearVerificadorGoogle('cid')!;
    await expect(v.verificar('tok')).resolves.toEqual({
      sub: 's1',
      email: 'ana@gmail.com',
      emailVerificado: true,
      nombre: 'Ana',
    });
  });

  it('devuelve null si la verificación falla', async () => {
    verifyIdToken.mockRejectedValue(new Error('network'));
    await expect(crearVerificadorGoogle('cid')!.verificar('tok')).resolves.toBeNull();
  });

  it('devuelve null si el payload no trae email', async () => {
    conPayload({ sub: 's1' });
    await expect(crearVerificadorGoogle('cid')!.verificar('tok')).resolves.toBeNull();
  });

  it('verifica contra la audiencia configurada', async () => {
    conPayload({ sub: 's1', email: 'a@b.com' });
    await crearVerificadorGoogle('cid')!.verificar('tok');
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'tok', audience: 'cid' });
  });
});
