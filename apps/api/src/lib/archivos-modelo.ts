import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_PREFIX } from '@pgim/shared';
import { env } from '../config/env';
import { AppError } from './errors';

// Modelos RA subidos: se guardan con un nombre aleatorio que pone el servidor y
// se sirven sin sesión, porque Scene Viewer (Android) y Quick Look (iOS) los
// descargan por su cuenta, sin la cookie del navegador.

export type FormatoModelo = 'glb' | 'usdz';

export const CARPETA_MODELOS = path.resolve(env.UPLOADS_DIR, 'modelos');
const URL_MODELOS = `${API_PREFIX}/uploads/modelos/`;

const MAGIA_GLB = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

// El .glb tiene que ser glTF 2.0 binario y autocontenido: una textura o un
// buffer en un archivo aparte no llegaría al visor.
export function validarGlb(archivo: Buffer): void {
  if (archivo.length < 20 || archivo.readUInt32LE(0) !== MAGIA_GLB) {
    throw new AppError(400, 'El archivo no es un modelo .glb');
  }
  if (archivo.readUInt32LE(4) !== 2 || archivo.readUInt32LE(8) !== archivo.length) {
    throw new AppError(400, 'El .glb está dañado o no es glTF 2.0');
  }
  const largoJson = archivo.readUInt32LE(12);
  if (archivo.readUInt32LE(16) !== CHUNK_JSON || 20 + largoJson > archivo.length) {
    throw new AppError(400, 'El .glb está dañado o no es glTF 2.0');
  }
  let gltf: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    gltf = JSON.parse(archivo.toString('utf8', 20, 20 + largoJson));
  } catch {
    throw new AppError(400, 'El .glb está dañado o no es glTF 2.0');
  }
  const externos = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].filter((r) => r.uri);
  if (externos.length > 0) {
    throw new AppError(
      400,
      'El .glb usa archivos externos (texturas o buffers): exportalo con todo incluido',
    );
  }
}

// Un .usdz es un ZIP sin comprimir: se verifica la firma.
export function validarUsdz(archivo: Buffer): void {
  if (archivo.length < 4 || archivo.readUInt32LE(0) !== 0x04034b50) {
    throw new AppError(400, 'El archivo no es un modelo .usdz');
  }
}

export async function guardarModelo(archivo: Buffer, formato: FormatoModelo): Promise<string> {
  const nombre = `${randomUUID()}.${formato}`;
  await mkdir(CARPETA_MODELOS, { recursive: true });
  await writeFile(path.join(CARPETA_MODELOS, nombre), archivo);
  return URL_MODELOS + nombre;
}

// Solo borra archivos de la carpeta de modelos; uno que ya no está no es error.
export async function borrarModelo(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith(URL_MODELOS)) return;
  try {
    await unlink(path.join(CARPETA_MODELOS, path.basename(url)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
