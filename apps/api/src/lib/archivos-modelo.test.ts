import { glbFalso, USDZ_FALSO } from '../test/glb-falso';
import { validarGlb, validarUsdz } from './archivos-modelo';

describe('validarGlb', () => {
  it('acepta un glTF 2.0 binario autocontenido', () => {
    expect(() => validarGlb(glbFalso())).not.toThrow();
  });

  it('rechaza un archivo que no es .glb', () => {
    expect(() => validarGlb(Buffer.from('<html><script>alert(1)</script></html>'))).toThrow(
      'no es un modelo .glb',
    );
  });

  it('rechaza un .glb cortado', () => {
    const glb = glbFalso();
    expect(() => validarGlb(glb.subarray(0, glb.length - 4))).toThrow('dañado');
  });

  it('rechaza un .glb con texturas externas', () => {
    const glb = glbFalso({ asset: { version: '2.0' }, images: [{ uri: 'Textures/colormap.png' }] });
    expect(() => validarGlb(glb)).toThrow('archivos externos');
  });

  it('acepta texturas embebidas en el buffer', () => {
    const glb = glbFalso({ asset: { version: '2.0' }, images: [{ bufferView: 0 }] });
    expect(() => validarGlb(glb)).not.toThrow();
  });
});

describe('validarUsdz', () => {
  it('acepta un ZIP', () => {
    expect(() => validarUsdz(USDZ_FALSO)).not.toThrow();
  });

  it('rechaza otro formato', () => {
    expect(() => validarUsdz(glbFalso())).toThrow('no es un modelo .usdz');
  });
});
