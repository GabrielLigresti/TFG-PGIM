import { AppError } from './errors';

// Lector mínimo de MP4/MOV: recorre las cajas (atoms) para sacar duración y
// resolución sin decodificar el video. Recorre todas las de primer nivel porque
// en las grabaciones de celular el moov suele ir después del mdat.

export type FormatoVideo = 'mp4' | 'mov';

export interface MetadatosMp4 {
  ancho: number;
  alto: number;
  duracionS: number;
}

interface Caja {
  tipo: string;
  inicio: number; // primer byte del contenido
  fin: number;
}

const MENSAJE = 'El video tiene que ser MP4 o MOV';

function invalido(): never {
  throw new AppError(400, MENSAJE);
}

function cajas(archivo: Buffer, desde: number, hasta: number): Caja[] {
  const resultado: Caja[] = [];
  let pos = desde;
  while (pos < hasta) {
    if (pos + 8 > hasta) invalido();
    let tamano = archivo.readUInt32BE(pos);
    const tipo = archivo.toString('latin1', pos + 4, pos + 8);
    let cabecera = 8;
    if (tamano === 1) {
      if (pos + 16 > hasta) invalido();
      const grande = archivo.readBigUInt64BE(pos + 8);
      if (grande > BigInt(hasta - pos)) invalido();
      tamano = Number(grande);
      cabecera = 16;
    } else if (tamano === 0) {
      tamano = hasta - pos;
    }
    if (tamano < cabecera || pos + tamano > hasta) invalido();
    resultado.push({ tipo, inicio: pos + cabecera, fin: pos + tamano });
    pos += tamano;
  }
  return resultado;
}

function leerUint64(archivo: Buffer, pos: number): number {
  return Number(archivo.readBigUInt64BE(pos));
}

export function formatoVideo(archivo: Buffer): FormatoVideo {
  return archivo.length >= 12 && archivo.toString('latin1', 8, 12) === 'qt  ' ? 'mov' : 'mp4';
}

export function leerMetadatosMp4(archivo: Buffer): MetadatosMp4 {
  if (archivo.length < 12 || archivo.toString('latin1', 4, 8) !== 'ftyp') invalido();

  const moov = cajas(archivo, 0, archivo.length).find((c) => c.tipo === 'moov');
  if (!moov) invalido();
  const hijas = cajas(archivo, moov.inicio, moov.fin);

  const mvhd = hijas.find((c) => c.tipo === 'mvhd');
  if (!mvhd) invalido();
  const version = archivo[mvhd.inicio];
  let timescale: number;
  let duracion: number;
  if (version === 1) {
    if (mvhd.fin - mvhd.inicio < 32) invalido();
    timescale = archivo.readUInt32BE(mvhd.inicio + 20);
    duracion = leerUint64(archivo, mvhd.inicio + 24);
  } else {
    if (mvhd.fin - mvhd.inicio < 20) invalido();
    timescale = archivo.readUInt32BE(mvhd.inicio + 12);
    duracion = archivo.readUInt32BE(mvhd.inicio + 16);
  }
  if (timescale === 0) invalido();

  for (const trak of hijas.filter((c) => c.tipo === 'trak')) {
    const tkhd = cajas(archivo, trak.inicio, trak.fin).find((c) => c.tipo === 'tkhd');
    if (!tkhd) continue;
    const v1 = archivo[tkhd.inicio] === 1;
    const offset = tkhd.inicio + (v1 ? 88 : 76);
    if (offset + 8 > tkhd.fin) continue;
    // Ancho y alto vienen en punto fijo 16.16.
    const ancho = archivo.readUInt32BE(offset) / 65536;
    const alto = archivo.readUInt32BE(offset + 4) / 65536;
    if (ancho > 0 && alto > 0) return { ancho, alto, duracionS: duracion / timescale };
  }
  return invalido();
}
