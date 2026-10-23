// Arma un .glb mínimo (cabecera + chunk JSON) para los tests.
export function glbFalso(gltf: object = { asset: { version: '2.0' } }): Buffer {
  let json = Buffer.from(JSON.stringify(gltf));
  // Los chunks van alineados a 4 bytes, completados con espacios.
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const cabecera = Buffer.alloc(20);
  cabecera.writeUInt32LE(0x46546c67, 0);
  cabecera.writeUInt32LE(2, 4);
  cabecera.writeUInt32LE(20 + json.length, 8);
  cabecera.writeUInt32LE(json.length, 12);
  cabecera.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([cabecera, json]);
}

export const USDZ_FALSO = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
