import { glbFalso } from '../test/glb-falso';
import { validarFoto } from './archivos-foto';

const conCabecera = (...bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(32)]);

describe('validarFoto', () => {
  it('reconoce JPG, PNG y WEBP por su contenido', () => {
    expect(validarFoto(conCabecera(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(validarFoto(conCabecera(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(16),
    ]);
    expect(validarFoto(webp)).toBe('webp');
  });

  it('rechaza otros archivos aunque digan ser imágenes', () => {
    expect(() => validarFoto(glbFalso())).toThrow('La foto tiene que ser JPG, PNG o WEBP');
    expect(() => validarFoto(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow(
      'JPG, PNG o WEBP',
    );
    expect(() => validarFoto(Buffer.alloc(0))).toThrow('JPG, PNG o WEBP');
  });
});
