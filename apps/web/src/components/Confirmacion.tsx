import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { Boton } from './ui';

// Confirmación de acciones destructivas: nombra el objeto y la consecuencia, y
// los botones son "Volver" y la acción ("Dar de baja"), nunca Aceptar/Cancelar.
// Va dentro del router: si cambia la pantalla con el diálogo abierto (por
// ejemplo, con "atrás"), se responde que no.

interface Pedido {
  mensaje: string;
  detalle?: string;
  accion: string;
  // Una acción que no destruye nada (por ejemplo, pagar) va como botón principal.
  principal?: boolean;
}

type Confirmar = (pedido: Pedido) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function ProveedorConfirmacion({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const { pathname } = useLocation();

  const responder = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  }, []);

  // Un pedido nuevo cancela el anterior en vez de dejar su promesa colgada.
  const confirmar = useCallback<Confirmar>(
    (nuevo) =>
      new Promise((ok) => {
        resolver.current?.(false);
        resolver.current = ok;
        setPedido(nuevo);
      }),
    [],
  );

  useEffect(() => responder(false), [pathname, responder]);

  return (
    <Contexto value={confirmar}>
      {children}
      {pedido && <DialogoConfirmacion pedido={pedido} onResponder={responder} />}
    </Contexto>
  );
}

function DialogoConfirmacion({
  pedido,
  onResponder,
}: {
  pedido: Pedido;
  onResponder(ok: boolean): void;
}) {
  const id = useId();
  const dialogo = useRef<HTMLDivElement>(null);
  const volver = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    volver.current?.focus();

    // En captura y sin propagar: Escape y Tab quedan en este diálogo y no
    // llegan a un modal abierto debajo (que se cerraría con el mismo Escape).
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onResponder(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const botones = dialogo.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!botones?.length) return;
      const primero = botones[0]!;
      const ultimo = botones[botones.length - 1]!;
      const dentro = dialogo.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primero || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault();
        primero.focus();
      }
    };
    window.addEventListener('keydown', alPresionar, true);
    return () => {
      window.removeEventListener('keydown', alPresionar, true);
      // Si el elemento de origen ya no existe (por ejemplo, la fila dada de baja), el foco queda donde el navegador lo deje.
      if (anterior?.isConnected) anterior.focus();
    };
  }, [onResponder]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={dialogo}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={pedido.detalle ? `${id}-detalle` : undefined}
        className="w-full max-w-sm space-y-4 rounded-panel bg-surface p-5 shadow-flotante"
      >
        <h2 id={`${id}-titulo`} className="text-lg font-semibold text-ink">
          {pedido.mensaje}
        </h2>
        {pedido.detalle && (
          <p id={`${id}-detalle`} className="text-sm text-text">
            {pedido.detalle}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-2">
          <Boton ref={volver} variante="fantasma" onClick={() => onResponder(false)}>
            Volver
          </Boton>
          <Boton
            variante={pedido.principal ? 'principal' : 'peligro'}
            onClick={() => onResponder(true)}
          >
            {pedido.accion}
          </Boton>
        </div>
      </div>
    </div>
  );
}

export function useConfirmar() {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useConfirmar se usa dentro de ProveedorConfirmacion');
  return contexto;
}
