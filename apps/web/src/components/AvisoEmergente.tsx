import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

// Avisos que flotan abajo a la derecha, para confirmar una acción ("Mesa 6
// activada") y, cuando el cambio se puede revertir, ofrecer "Deshacer".

interface OpcionesAviso {
  deshacer?: () => void;
  duracionMs?: number;
}

interface AvisoActivo extends OpcionesAviso {
  id: number;
  texto: string;
}

const Contexto = createContext<{ avisar(texto: string, opciones?: OpcionesAviso): void } | null>(
  null,
);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<AvisoActivo[]>([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => {
    setAvisos((lista) => lista.filter((a) => a.id !== id));
  }, []);

  const avisar = useCallback(
    (texto: string, opciones: OpcionesAviso = {}) => {
      const id = siguiente.current++;
      setAvisos((lista) => [...lista, { id, texto, ...opciones }]);
      setTimeout(() => quitar(id), opciones.duracionMs ?? 5000);
    },
    [quitar],
  );

  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <Contexto value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 grid max-w-[calc(100%-2rem)] justify-items-end gap-2"
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex items-center gap-3 rounded-panel bg-ink px-4 py-2.5 text-sm text-white shadow-flotante"
          >
            <span>{a.texto}</span>
            {a.deshacer && (
              <button
                type="button"
                onClick={() => {
                  a.deshacer?.();
                  quitar(a.id);
                }}
                className="min-h-9 rounded-control px-2 font-semibold text-accent-soft hover:bg-surface/10"
              >
                Deshacer
              </button>
            )}
          </div>
        ))}
      </div>
    </Contexto>
  );
}

export function useAvisos() {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useAvisos se usa dentro de ProveedorAvisos');
  return contexto;
}
