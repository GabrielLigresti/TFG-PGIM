import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// La carpeta de uploads se fija antes de cargar la configuración.
const UPLOADS = mkdtempSync(path.join(tmpdir(), 'pgim-videos-'));
process.env.UPLOADS_DIR = UPLOADS;
const { CARPETA_VIDEOS, borrarVideo, guardarVideo, leerVideo } =
  require('./archivos-video') as typeof import('./archivos-video');

describe('archivos de video', () => {
  it('guarda y lee un video', async () => {
    const contenido = Buffer.from('video de prueba');
    const ruta = await guardarVideo(contenido, 'mp4');
    expect(path.dirname(ruta)).toBe(CARPETA_VIDEOS);
    expect(ruta).toMatch(/\.mp4$/);
    expect((await leerVideo(ruta)).equals(contenido)).toBe(true);
  });

  it('borrar dos veces no falla', async () => {
    const ruta = await guardarVideo(Buffer.from('x'), 'mov');
    await borrarVideo(ruta);
    expect(existsSync(ruta)).toBe(false);
    await expect(borrarVideo(ruta)).resolves.toBeUndefined();
    await expect(borrarVideo(null)).resolves.toBeUndefined();
  });

  it('ignora rutas fuera de la carpeta de videos', async () => {
    const afuera = path.join(UPLOADS, 'otro.txt');
    writeFileSync(afuera, 'no se toca');
    await borrarVideo(afuera);
    await borrarVideo(path.join(CARPETA_VIDEOS, '..', 'otro.txt'));
    expect(existsSync(afuera)).toBe(true);
  });
});
