import { prisma } from '../lib/prisma';
import { limpiarBase } from '../test/db-setup';
import { usuarioRepository } from './usuario.repository';

afterAll(() => prisma.$disconnect());

beforeEach(limpiarBase);

describe('usuarioRepository (ingreso con Google)', () => {
  it('crearComensalGoogle crea el usuario sin contraseña, con su googleId y su comensal', async () => {
    const id = await usuarioRepository.crearComensalGoogle({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      nombre: 'Ana',
    });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id },
      include: { comensal: true },
    });
    expect(usuario).toMatchObject({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      passwordHash: null,
      tipo: 'COMENSAL',
      activo: true,
    });
    expect(usuario.comensal).toMatchObject({ nombre: 'Ana', telefono: null });
  });

  it('un email repetido da P2002 y no deja un usuario a medias', async () => {
    await usuarioRepository.crearComensalGoogle({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      nombre: 'Ana',
    });

    await expect(
      usuarioRepository.crearComensalGoogle({
        email: 'ana@gmail.com',
        googleId: 'sub-2',
        nombre: 'Ana 2',
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.comensal.count()).toBe(1);
  });

  it('un googleId repetido en el alta da P2002', async () => {
    await usuarioRepository.crearComensalGoogle({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      nombre: 'Ana',
    });

    await expect(
      usuarioRepository.crearComensalGoogle({
        email: 'otra@gmail.com',
        googleId: 'sub-1',
        nombre: 'Otra',
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('vincularGoogle guarda el googleId y uno tomado da P2002', async () => {
    const ana = await usuarioRepository.crearComensalGoogle({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      nombre: 'Ana',
    });
    const luis = await prisma.usuario.create({
      data: { email: 'luis@demo.test', passwordHash: 'x', tipo: 'COMENSAL' },
    });

    await expect(usuarioRepository.vincularGoogle(luis.id, 'sub-1')).rejects.toMatchObject({
      code: 'P2002',
    });
    await usuarioRepository.vincularGoogle(luis.id, 'sub-2');

    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: luis.id } })).googleId).toBe(
      'sub-2',
    );
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: ana } })).googleId).toBe('sub-1');
  });

  it('findCuentaByGoogleId y findCuentaByEmail devuelven id, tipo, activo y googleId', async () => {
    const id = await usuarioRepository.crearComensalGoogle({
      email: 'ana@gmail.com',
      googleId: 'sub-1',
      nombre: 'Ana',
    });
    const esperada = { id, tipo: 'COMENSAL', activo: true, googleId: 'sub-1' };

    expect(await usuarioRepository.findCuentaByGoogleId('sub-1')).toEqual(esperada);
    expect(await usuarioRepository.findCuentaByEmail('ana@gmail.com')).toEqual(esperada);
    expect(await usuarioRepository.findCuentaByGoogleId('nadie')).toBeNull();
    expect(await usuarioRepository.findCuentaByEmail('nadie@gmail.com')).toBeNull();
  });
});
