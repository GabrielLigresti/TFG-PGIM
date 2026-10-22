import '@google/model-viewer';
import type { ModelViewerElement } from '@google/model-viewer';
import { useEffect, useRef, useState } from 'react';

// Prueba corta (spike) de RA: un modelo .glb servido por la propia app, con
// escala ajustable. Se reemplaza por el visor de CU-10.

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<ModelViewerElement>,
        ModelViewerElement
      > & {
        src?: string;
        alt?: string;
        ar?: boolean;
        'ar-modes'?: string;
        'ar-scale'?: string;
        'camera-controls'?: boolean;
        scale?: string;
      };
    }
  }
}

const MODELO = '/modelos-demo/burger-cheese.glb';

interface Diagnostico {
  contextoSeguro: boolean;
  puedeRA: boolean;
  tamanoCm: string;
}

export function PruebaRaPage() {
  const visor = useRef<ModelViewerElement>(null);
  const [escala, setEscala] = useState(1);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [eventos, setEventos] = useState<string[]>([]);

  useEffect(() => {
    const el = visor.current;
    if (!el) return;
    const actualizar = () => {
      const { x, y, z } = el.getDimensions();
      const cm = (v: number) => (v * 100).toFixed(1);
      setDiag({
        contextoSeguro: window.isSecureContext,
        puedeRA: el.canActivateAR,
        tamanoCm: `${cm(x)} × ${cm(y)} × ${cm(z)} cm (ancho × alto × prof.)`,
      });
    };
    const registrar = (e: Event) => {
      const detalle = (e as CustomEvent<{ status?: string }>).detail?.status ?? '';
      setEventos((prev) => [...prev, `${e.type} ${detalle}`.trim()]);
    };
    el.addEventListener('load', actualizar);
    el.addEventListener('ar-status', registrar);
    el.addEventListener('error', registrar);
    if (el.loaded) actualizar();
    return () => {
      el.removeEventListener('load', actualizar);
      el.removeEventListener('ar-status', registrar);
      el.removeEventListener('error', registrar);
    };
  }, [escala]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 bg-slate-50 p-4">
      <h1 className="text-xl font-semibold text-slate-800">Prueba de RA</h1>
      <model-viewer
        ref={visor}
        src={MODELO}
        alt="Hamburguesa con queso"
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="fixed"
        camera-controls
        scale={`${escala} ${escala} ${escala}`}
        style={{ width: '100%', height: '60vh', background: 'white', borderRadius: 12 }}
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        Escala
        <input
          type="text"
          inputMode="decimal"
          defaultValue="1"
          onChange={(e) => {
            const valor = Number(e.target.value.replace(',', '.'));
            if (valor > 0) setEscala(valor);
          }}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-base"
        />
      </label>
      {diag && (
        <ul className="text-sm text-slate-600">
          <li>Contexto seguro (HTTPS): {diag.contextoSeguro ? 'sí' : 'no'}</li>
          <li>RA disponible en este dispositivo: {diag.puedeRA ? 'sí' : 'no'}</li>
          <li>Tamaño con la escala actual: {diag.tamanoCm}</li>
        </ul>
      )}
      {eventos.length > 0 && (
        <ul className="text-xs text-slate-500">
          {eventos.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
