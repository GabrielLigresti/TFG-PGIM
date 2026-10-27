import type { ModelViewerElement } from '@google/model-viewer';
import { useEffect, useRef, useState } from 'react';
import type { ModeloRa } from '@pgim/shared';
import { formatoCantidad } from '../lib/formato';
import { useModelViewer } from '../lib/useModelViewer';

type Estado = 'cargando' | 'listo' | 'sin-ra' | 'fallo-ra' | 'error';
type EstadoSesion = 'abriendo' | 'buscando' | 'apuntando' | 'colocado';

const MENSAJES: Partial<Record<Estado, string>> = {
  'sin-ra': 'Este dispositivo no permite ver el plato en realidad aumentada.',
  'fallo-ra': 'No se pudo abrir la realidad aumentada (¿se negó el permiso de la cámara?).',
  error: 'No se pudo cargar el modelo 3D del plato.',
};

const INSTRUCCIONES: Record<EstadoSesion, string> = {
  abriendo: 'Abriendo la cámara…',
  buscando: 'Mové el celular despacio, apuntando a la mesa cerca del plato.',
  apuntando: 'Apuntá el anillo al centro del plato y tocá la pantalla.',
  colocado: 'Tocá otro punto para moverlo.',
};

// Los botones de la capa sobre la cámara no cuentan como toques para ubicar el plato.
const frenarSeleccion = (e: Event) => e.preventDefault();

// Visor de CU-10: el plato en 3D y el botón "Ver en RA" a escala real. En
// Android con WebXR, la RA es propia (ver lib/ra-webxr): el comensal apunta al
// plato y el modelo aparece apoyado ahí. Si no hay WebXR, model-viewer abre
// Quick Look (iOS, con el .usdz o el que genera) o Scene Viewer. E2: sin RA o
// si falla, se muestra la foto del plato con la porción.
export function VisorRA({
  modelo,
  nombre,
  fotoUrl,
  alAgregar,
  cantidadEnPedido = 0,
}: {
  modelo: ModeloRa;
  nombre: string;
  fotoUrl: string | null;
  // Con la mesa activa: "Agregar al pedido" dentro de la RA (flujo A de CU-10).
  alAgregar?: () => void;
  cantidadEnPedido?: number;
}) {
  const listo = useModelViewer();
  const visor = useRef<ModelViewerElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [webXR, setWebXR] = useState<boolean | null>(null);
  const [sesion, setSesion] = useState<EstadoSesion | null>(null);
  const salir = useRef<(() => void) | null>(null);
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const conDiagnostico = new URLSearchParams(window.location.search).has('diag');

  useEffect(() => {
    void import('../lib/ra-webxr').then(({ soportaRaWebXR }) => soportaRaWebXR().then(setWebXR));
  }, []);

  useEffect(() => {
    const el = visor.current;
    if (!el || webXR === null) return;
    const alCargar = () => setEstado(webXR || el.canActivateAR ? 'listo' : 'sin-ra');
    const alFallar = () => setEstado('error');
    const alCambiarRA = (e: Event) => {
      if ((e as CustomEvent<{ status: string }>).detail.status === 'failed') setEstado('fallo-ra');
    };
    if (el.loaded) alCargar();
    el.addEventListener('load', alCargar);
    el.addEventListener('error', alFallar);
    el.addEventListener('ar-status', alCambiarRA);
    return () => {
      el.removeEventListener('load', alCargar);
      el.removeEventListener('error', alFallar);
      el.removeEventListener('ar-status', alCambiarRA);
    };
  }, [listo, webXR]);

  // Si se sale de la página con la RA abierta, se cierra la sesión.
  useEffect(() => () => salir.current?.(), []);

  async function abrirRa() {
    if (!capa.current) return;
    setSesion('abriendo');
    try {
      const { iniciarRa } = await import('../lib/ra-webxr');
      salir.current = await iniciarRa({
        urlModelo: modelo.urlModelo,
        escalaReal: modelo.escalaReal,
        overlay: capa.current,
        onEstado: setSesion,
        ...(conDiagnostico && { onDiagnostico: setDiagnostico }),
        onFin: () => {
          salir.current = null;
          setSesion(null);
        },
      });
    } catch {
      setSesion(null);
      setEstado('fallo-ra');
    }
  }

  const escala = `${modelo.escalaReal} ${modelo.escalaReal} ${modelo.escalaReal}`;
  const porcion = formatoCantidad(modelo.porcionGramos, 'GRAMO');
  const mensaje = MENSAJES[estado];
  // Sin WebXR, la RA la abre model-viewer (Quick Look o Scene Viewer).
  const arDeModelViewer = webXR === false;

  return (
    <div className="space-y-3">
      {estado !== 'error' && listo && webXR !== null && (
        <div className="relative">
          <model-viewer
            ref={visor}
            src={modelo.urlModelo}
            ios-src={modelo.urlModeloIos ?? undefined}
            alt={`Modelo 3D de ${nombre}`}
            ar={arDeModelViewer}
            ar-modes="quick-look scene-viewer"
            ar-scale="fixed"
            camera-controls
            touch-action="pan-y"
            scale={escala}
            style={{
              width: '100%',
              height: '18rem',
              background: 'var(--color-surface)',
              borderRadius: 8,
            }}
          >
            {arDeModelViewer && (
              <button slot="ar-button" type="button" className={claseBotonRa}>
                Ver en mi mesa
              </button>
            )}
          </model-viewer>
          {webXR && (estado === 'listo' || estado === 'fallo-ra') && (
            <button
              type="button"
              onClick={abrirRa}
              disabled={sesion !== null}
              className={claseBotonRa}
            >
              {sesion === 'abriendo' ? 'Abriendo…' : 'Ver en mi mesa'}
            </button>
          )}
        </div>
      )}
      {estado === 'cargando' && <p className="text-sm text-meta">Cargando el modelo 3D…</p>}
      {estado === 'listo' && (
        <p className="text-sm text-meta">
          Tocá “Ver en mi mesa” y apuntá al centro del plato: aparece a tamaño real ({porcion}).
        </p>
      )}
      {mensaje && (
        <div className="space-y-2 rounded-panel border border-line bg-surface p-3">
          <p className="text-sm text-meta">{mensaje}</p>
          {fotoUrl && (
            <img
              src={fotoUrl}
              alt={nombre}
              className="aspect-video w-full rounded-control object-cover"
            />
          )}
          <p className="text-sm text-meta">Porción: {porcion}</p>
        </div>
      )}

      {/* Capa sobre la cámara durante la RA propia (dom-overlay de WebXR). */}
      <div ref={capa} className={sesion ? 'fixed inset-0 z-50' : 'hidden'}>
        <div className="absolute inset-x-4 top-4 rounded-panel bg-black/60 px-4 py-3 text-center text-white">
          <p className="font-medium">{nombre}</p>
          <p className="text-sm">{sesion && INSTRUCCIONES[sesion]}</p>
          <p className="text-xs opacity-80">Porción: {porcion}</p>
          {diagnostico && <p className="mt-1 font-mono text-xs opacity-90">{diagnostico}</p>}
        </div>
        <div className="absolute inset-x-4 bottom-8 flex justify-center gap-3">
          <button
            type="button"
            ref={(b) => {
              b?.addEventListener('beforexrselect', frenarSeleccion);
            }}
            onClick={() => salir.current?.()}
            className="min-h-12 rounded-full bg-surface px-6 font-semibold text-ink shadow-flotante"
          >
            Salir
          </button>
          {alAgregar && (
            <button
              type="button"
              ref={(b) => {
                b?.addEventListener('beforexrselect', frenarSeleccion);
              }}
              onClick={alAgregar}
              className="min-h-12 rounded-full bg-accent px-6 font-semibold text-white shadow-flotante"
            >
              {cantidadEnPedido > 0
                ? `Agregar otro (${cantidadEnPedido} en el pedido)`
                : 'Agregar al pedido'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const claseBotonRa =
  'absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-accent px-5 font-semibold text-white shadow-flotante hover:bg-accent-hover disabled:opacity-70';
