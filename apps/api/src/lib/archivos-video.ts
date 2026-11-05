import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import type { FormatoVideo } from './mp4';

// Videos del escaneo: quedan en disco con un nombre aleatorio y nunca se sirven
// por HTTP; el proveedor los lee desde la ruta y después se borran.

export const CARPETA_VIDEOS = path.resolve(env.UPLOADS_DIR, 'escaneos');

export async function guardarVideo(archivo: Buffer, formato: FormatoVideo): Promise<string> {
  const ruta = path.join(CARPETA_VIDEOS, `${randomUUID()}.${formato}`);
  await mkdir(CARPETA_VIDEOS, { recursive: true });
  await writeFile(ruta, archivo);
  return ruta;
}

export function leerVideo(ruta: string): Promise<Buffer> {
  return readFile(ruta);
}

// Solo borra archivos de la carpeta de videos; uno que ya no está no es error.
export async function borrarVideo(ruta: string | null): Promise<void> {
  if (!ruta) return;
  const absoluta = path.resolve(ruta);
  if (path.dirname(absoluta) !== CARPETA_VIDEOS) return;
  try {
    await unlink(absoluta);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
