// Arma un MP4 mínimo (ftyp, mdat y moov con mvhd y un trak con tkhd) para los tests.
export interface OpcionesMp4Falso {
  ancho: number;
  alto: number;
  duracionS: number;
  moovAlFinal?: boolean;
  version1?: boolean;
  marca?: string;
  largesize?: boolean;
}

export function caja(tipo: string, contenido: Buffer = Buffer.alloc(0), largesize = false): Buffer {
  if (largesize) {
    const cabecera = Buffer.alloc(16);
    cabecera.writeUInt32BE(1, 0);
    cabecera.write(tipo, 4, 'latin1');
    cabecera.writeBigUInt64BE(BigInt(16 + contenido.length), 8);
    return Buffer.concat([cabecera, contenido]);
  }
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(8 + contenido.length, 0);
  cabecera.write(tipo, 4, 'latin1');
  return Buffer.concat([cabecera, contenido]);
}

const TIMESCALE = 1000;

function mvhd(duracionS: number, version1: boolean): Buffer {
  if (version1) {
    const c = Buffer.alloc(112);
    c.writeUInt8(1, 0);
    c.writeUInt32BE(TIMESCALE, 20);
    c.writeBigUInt64BE(BigInt(duracionS * TIMESCALE), 24);
    return caja('mvhd', c);
  }
  const c = Buffer.alloc(100);
  c.writeUInt32BE(TIMESCALE, 12);
  c.writeUInt32BE(duracionS * TIMESCALE, 16);
  return caja('mvhd', c);
}

function tkhd(ancho: number, alto: number, version1: boolean): Buffer {
  const c = Buffer.alloc(version1 ? 96 : 84);
  const offset = version1 ? 88 : 76;
  if (version1) c.writeUInt8(1, 0);
  c.writeUInt32BE(ancho * 65536, offset);
  c.writeUInt32BE(alto * 65536, offset + 4);
  return caja('tkhd', c);
}

export function mp4Falso(opciones: OpcionesMp4Falso): Buffer {
  const {
    ancho,
    alto,
    duracionS,
    moovAlFinal = false,
    version1 = false,
    marca = 'isom',
  } = opciones;
  const ftyp = caja(
    'ftyp',
    Buffer.concat([Buffer.from(marca.padEnd(4).slice(0, 4), 'latin1'), Buffer.alloc(4)]),
  );
  const mdat = caja('mdat', Buffer.alloc(64, 1), opciones.largesize);
  const moov = caja(
    'moov',
    Buffer.concat([mvhd(duracionS, version1), caja('trak', tkhd(ancho, alto, version1))]),
    opciones.largesize,
  );
  return Buffer.concat(moovAlFinal ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}
