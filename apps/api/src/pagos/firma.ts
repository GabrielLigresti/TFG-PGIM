import { createHmac, timingSafeEqual } from 'node:crypto';

// Firma de las notificaciones de Mercado Pago: el encabezado x-signature trae
// "ts=<segundos>,v1=<hmac>", y el HMAC-SHA256 con la clave secreta del webhook
// se calcula sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". Un id
// alfanumérico se firma en minúsculas.
export function verificarFirma(opciones: {
  encabezado: string | undefined;
  requestId: string | undefined;
  dataId: string;
  secreto: string;
}): boolean {
  const { encabezado, requestId, dataId, secreto } = opciones;
  if (!encabezado || !requestId) return false;
  const partes = new Map(
    encabezado.split(',').map((parte) => {
      const [clave, ...valor] = parte.split('=');
      return [clave?.trim(), valor.join('=').trim()] as const;
    }),
  );
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const esperado = createHmac('sha256', secreto).update(manifiesto).digest();
  return timingSafeEqual(esperado, Buffer.from(v1, 'hex'));
}
