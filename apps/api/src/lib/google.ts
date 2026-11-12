import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

export interface IdentidadGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string | null;
}

export interface VerificadorGoogle {
  verificar(credential: string): Promise<IdentidadGoogle | null>;
}

// null: el ingreso con Google no está configurado. Cualquier falla al verificar
// (token inválido, sin red, certificados no disponibles) devuelve null.
export function crearVerificadorGoogle(clientId: string | undefined): VerificadorGoogle | null {
  if (!clientId) return null;
  const cliente = new OAuth2Client(clientId);
  return {
    async verificar(credential) {
      try {
        const ticket = await cliente.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) return null;
        return {
          sub: payload.sub,
          email: payload.email.toLowerCase(),
          emailVerificado: payload.email_verified === true,
          nombre: payload.name ?? null,
        };
      } catch {
        return null;
      }
    },
  };
}

export const verificadorGoogle = crearVerificadorGoogle(env.GOOGLE_CLIENT_ID);
