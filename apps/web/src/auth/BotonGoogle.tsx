import { useEffect, useRef, useState } from 'react';

// Tipado mínimo de Google Identity Services (lo que usamos).
interface RespuestaGoogle {
  credential?: string;
}
interface GoogleId {
  initialize(opciones: { client_id: string; callback: (respuesta: RespuestaGoogle) => void }): void;
  renderButton(
    elemento: HTMLElement,
    opciones: {
      theme: 'outline';
      size: 'large';
      shape: 'rectangular';
      text: 'continue_with';
      locale: string;
      width: number;
    },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const URL_GIS = 'https://accounts.google.com/gsi/client';
const ANCHO_MAXIMO = 400; // el máximo que acepta Google

const ANCHO_PREDETERMINADO = 240; // si el contenedor todavía no tiene medida

let carga: Promise<boolean> | null = null;
let inicializado = false;
// Último onCredential montado: el que atiende el callback único de Google.
let alCredencial: ((credential: string) => void) | null = null;

// Carga el script una sola vez; resuelve false si no se pudo cargar.
function cargarScript(): Promise<boolean> {
  carga ??= new Promise((resolver) => {
    if (window.google?.accounts?.id) return resolver(true);
    const script = document.createElement('script');
    script.src = URL_GIS;
    script.async = true;
    script.onload = () => {
      const ok = Boolean(window.google?.accounts?.id);
      if (!ok) carga = null; // script vacío (por ejemplo, un bloqueador): se reintenta después
      resolver(ok);
    };
    script.onerror = () => {
      carga = null; // permite reintentar al volver a la pantalla
      resolver(false);
    };
    document.head.appendChild(script);
  });
  return carga;
}

function useScriptGoogle(clientId: string | undefined): boolean {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let activo = true;
    void cargarScript().then((ok) => {
      if (activo) setListo(ok);
    });
    return () => {
      activo = false;
    };
  }, [clientId]);
  return listo;
}

// Botón oficial "Continuar con Google". Sin client ID o sin script, no muestra nada
// (ni el separador): la pantalla queda con el ingreso por email.
export function BotonGoogle({ onCredential }: { onCredential: (credential: string) => void }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const listo = useScriptGoogle(clientId);
  const contenedor = useRef<HTMLDivElement>(null);
  // Google se inicializa una sola vez; el callback usa el último botón montado.
  alCredencial = onCredential;

  useEffect(() => {
    const elemento = contenedor.current;
    const id = window.google?.accounts.id;
    if (!listo || !clientId || !elemento || !id) return;
    if (!inicializado) {
      inicializado = true;
      id.initialize({
        client_id: clientId,
        // Cerrar el popup no llama al callback, así que no hay error que mostrar.
        callback: ({ credential }) => {
          if (credential) alCredencial?.(credential);
        },
      });
    }
    id.renderButton(elemento, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      locale: 'es',
      width: Math.min(ANCHO_MAXIMO, Math.floor(elemento.clientWidth) || ANCHO_PREDETERMINADO),
    });
  }, [listo, clientId]);

  if (!clientId || !listo) return null;
  return (
    <>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-sm text-meta">o</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div ref={contenedor} className="flex min-h-11 justify-center" />
    </>
  );
}
