import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Boton, Modal } from './ui';

// Confirmación de acciones destructivas: nombra el objeto y la consecuencia, y
// los botones son "Volver" y la acción ("Dar de baja"), nunca Aceptar/Cancelar.

interface Pedido {
  mensaje: string;
  detalle?: string;
  accion: string;
}

type Confirmar = (pedido: Pedido) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function ProveedorConfirmacion({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<(ok: boolean) => void>(() => {});

  const confirmar = useCallback<Confirmar>(
    (nuevo) =>
      new Promise((ok) => {
        resolver.current = ok;
        setPedido(nuevo);
      }),
    [],
  );

  const responder = useCallback((ok: boolean) => {
    resolver.current(ok);
    setPedido(null);
  }, []);

  const valor = useMemo(() => confirmar, [confirmar]);

  return (
    <Contexto value={valor}>
      {children}
      {pedido && (
        <Modal titulo={pedido.mensaje} onCerrar={() => responder(false)} ancho="max-w-md">
          <div className="space-y-4">
            {pedido.detalle && <p className="text-sm text-text">{pedido.detalle}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="fantasma" onClick={() => responder(false)}>
                Volver
              </Boton>
              <Boton variante="peligro" onClick={() => responder(true)}>
                {pedido.accion}
              </Boton>
            </div>
          </div>
        </Modal>
      )}
    </Contexto>
  );
}

export function useConfirmar() {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useConfirmar se usa dentro de ProveedorConfirmacion');
  return contexto;
}
