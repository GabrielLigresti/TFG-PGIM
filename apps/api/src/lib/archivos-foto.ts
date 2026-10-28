import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_PREFIX } from '@pgim/shared';
import { env } from '../config/env';
import { AppError } from './errors';

// Fotos de platos subidas desde la computadora. Como los modelos RA, se
// guardan con un nombre aleatorio que pone el servidor y el formato sale del
// contenido, nunca del nombre ni del tipo que manda el navegador.

export type FormatoFoto = 'jpg' | 'png' | 'webp';

export const CARPETA_FOTOS = path.resolve(env.UPLOADS_DIR, 'fotos');
const URL_FOTOS = `${API_PREFIX}/uploads/fotos/`;

export const TIPO_FOTO: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const empiezaCon = (archivo: Buffer, bytes: number[], desde = 0) =>
  archivo.length >= desde + bytes.length && bytes.every((b, i) => archivo[desde + i] === b);

export function validarFoto(archivo: Buffer): FormatoFoto {
  if (empiezaCon(archivo, [0xff, 0xd8, 0xff])) return 'jpg';
  if (empiezaCon(archivo, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (archivo.toString('latin1', 0, 4) === 'RIFF' && archivo.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  throw new AppError(400, 'La foto tiene que ser JPG, PNG o WEBP');
}

export async function guardarFoto(archivo: Buffer, formato: FormatoFoto): Promise<string> {
  const nombre = `${randomUUID()}.${formato}`;
  await mkdir(CARPETA_FOTOS, { recursive: true });
  await writeFile(path.join(CARPETA_FOTOS, nombre), archivo);
  return URL_FOTOS + nombre;
}

// Solo borra fotos subidas: las de demo y los enlaces externos no se tocan.
export async function borrarFoto(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith(URL_FOTOS)) return;
  try {
    await unlink(path.join(CARPETA_FOTOS, path.basename(url)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
