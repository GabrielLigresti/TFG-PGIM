import { mp4Falso } from '../test/mp4-falso';
import { formatoVideo, leerMetadatosMp4 } from './mp4';

describe('leerMetadatosMp4', () => {
  it('lee duración y resolución de un mp4 v0', () => {
    const mp4 = mp4Falso({ ancho: 1920, alto: 1080, duracionS: 42 });
    expect(leerMetadatosMp4(mp4)).toEqual({ ancho: 1920, alto: 1080, duracionS: 42 });
  });

  it('lee mvhd y tkhd v1', () => {
    const mp4 = mp4Falso({ ancho: 1280, alto: 720, duracionS: 30, version1: true });
    expect(leerMetadatosMp4(mp4)).toEqual({ ancho: 1280, alto: 720, duracionS: 30 });
  });

  it('encuentra moov después de mdat', () => {
    const mp4 = mp4Falso({ ancho: 1920, alto: 1080, duracionS: 42, moovAlFinal: true });
    expect(leerMetadatosMp4(mp4)).toEqual({ ancho: 1920, alto: 1080, duracionS: 42 });
  });

  it('soporta largesize', () => {
    const mp4 = mp4Falso({
      ancho: 1920,
      alto: 1080,
      duracionS: 42,
      moovAlFinal: true,
      largesize: true,
    });
    expect(leerMetadatosMp4(mp4)).toEqual({ ancho: 1920, alto: 1080, duracionS: 42 });
  });

  it('rechaza un archivo sin ftyp', () => {
    expect(() => leerMetadatosMp4(Buffer.from('<html>no soy un video</html>'))).toThrow(
      'El video tiene que ser MP4 o MOV',
    );
  });

  it('rechaza un mp4 truncado', () => {
    const mp4 = mp4Falso({ ancho: 1920, alto: 1080, duracionS: 42, moovAlFinal: true });
    expect(() => leerMetadatosMp4(mp4.subarray(0, mp4.length - 20))).toThrow(
      'El video tiene que ser MP4 o MOV',
    );
  });
});

describe('formatoVideo', () => {
  it('distingue mov de mp4', () => {
    expect(formatoVideo(mp4Falso({ ancho: 1, alto: 1, duracionS: 1, marca: 'qt  ' }))).toBe('mov');
    expect(formatoVideo(mp4Falso({ ancho: 1, alto: 1, duracionS: 1, marca: 'isom' }))).toBe('mp4');
  });
});
