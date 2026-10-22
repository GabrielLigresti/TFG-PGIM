import type { ModelViewerElement } from '@google/model-viewer';
import { useEffect, useRef, useState } from 'react';
import type { ModeloRa } from '@pgim/shared';
import { formatoCantidad } from '../lib/formato';
import { useModelViewer } from '../lib/useModelViewer';

type Estado = 'cargando' | 'listo' | 'sin-ra' | 'fallo-ra' | 'error';

const MENSAJES: Partial<Record<Estado, string>> = {
  'sin-ra': 'Este dispositivo no permite ver el plato en realidad aumentada.',
  'fallo-ra': 'No se pudo abrir la realidad aumentada (¿se negó el permiso de la cámara?).',
  error: 'No se pudo cargar el modelo 3D del plato.',
};

// Visor de CU-10: el plato en 3D y el botón "Ver en RA", que abre la RA del
// dispositivo a escala real (WebXR o Scene Viewer en Android, Quick Look en
// iOS con el .usdz o el que genera model-viewer). E2: si no hay RA, se muestra
// la foto del plato con la porción.
export function VisorRA({
  modelo,
  nombre,
  fotoUrl,
}: {
  modelo: ModeloRa;
  nombre: string;
  fotoUrl: string | null;
}) {
  const listo = useModelViewer();
  const visor = useRef<ModelViewerElement>(null);
  const [estado, setEstado] = useState<Estado>('cargando');

  useEffect(() => {
    const el = visor.current;
    if (!el) return;
    const alCargar = () => setEstado(el.canActivateAR ? 'listo' : 'sin-ra');
    const alFallar = () => setEstado('error');
    const alCambiarRA = (e: Event) => {
      if ((e as CustomEvent<{ status: string }>).detail.status === 'failed') setEstado('fallo-ra');
    };
    el.addEventListener('load', alCargar);
    el.addEventListener('error', alFallar);
    el.addEventListener('ar-status', alCambiarRA);
    return () => {
      el.removeEventListener('load', alCargar);
      el.removeEventListener('error', alFallar);
      el.removeEventListener('ar-status', alCambiarRA);
    };
  }, [listo]);

  const escala = `${modelo.escalaReal} ${modelo.escalaReal} ${modelo.escalaReal}`;
  const porcion = formatoCantidad(modelo.porcionGramos, 'GRAMO');
  const mensaje = MENSAJES[estado];

  return (
    <div className="space-y-3">
      {estado !== 'error' && listo && (
        <model-viewer
          ref={visor}
          src={modelo.urlModelo}
          ios-src={modelo.urlModeloIos ?? undefined}
          alt={`Modelo 3D de ${nombre}`}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          camera-controls
          touch-action="pan-y"
          scale={escala}
          style={{ width: '100%', height: '18rem', background: 'white', borderRadius: 12 }}
        >
          <button
            slot="ar-button"
            type="button"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 font-medium text-white shadow"
          >
            Ver en RA
          </button>
        </model-viewer>
      )}
      {estado === 'cargando' && <p className="text-sm text-slate-500">Cargando el modelo 3D…</p>}
      {estado === 'listo' && (
        <p className="text-sm text-slate-500">
          Tocá “Ver en RA” y apuntá a la mesa: el plato aparece a tamaño real ({porcion}).
        </p>
      )}
      {mensaje && (
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{mensaje}</p>
          {fotoUrl && (
            <img
              src={fotoUrl}
              alt={nombre}
              className="aspect-video w-full rounded-lg object-cover"
            />
          )}
          <p className="text-sm text-slate-600">Porción: {porcion}</p>
        </div>
      )}
    </div>
  );
}
