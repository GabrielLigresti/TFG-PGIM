import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { MAX_CANTIDAD_LINEA } from '@pgim/shared';

// Pedido en armado del comensal (carrito), en el navegador: el modelo no lo
// guarda. Hay uno por cuenta de mesa y sobrevive a una recarga (localStorage).

export interface PlatoCarrito {
  id: string;
  nombre: string;
  precio: number;
  // false: su categoría no lleva aclaración. Falta en carritos guardados antes.
  admiteObservaciones?: boolean;
}

export interface LineaCarrito {
  plato: PlatoCarrito;
  cantidad: number;
  observaciones: string;
}

const Contexto = createContext<{
  carritos: Record<string, LineaCarrito[]>;
  guardar(cuentaMesaId: string, lineas: LineaCarrito[]): void;
} | null>(null);

const clave = (cuentaMesaId: string) => `carrito:${cuentaMesaId}`;

function leer(cuentaMesaId: string): LineaCarrito[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(clave(cuentaMesaId)) ?? '[]');
    return Array.isArray(guardado) ? (guardado as LineaCarrito[]) : [];
  } catch {
    return [];
  }
}

export function ProveedorCarrito({ children }: { children: ReactNode }) {
  const [carritos, setCarritos] = useState<Record<string, LineaCarrito[]>>({});

  const guardar = useCallback((cuentaMesaId: string, lineas: LineaCarrito[]) => {
    setCarritos((c) => ({ ...c, [cuentaMesaId]: lineas }));
    try {
      if (lineas.length === 0) localStorage.removeItem(clave(cuentaMesaId));
      else localStorage.setItem(clave(cuentaMesaId), JSON.stringify(lineas));
    } catch {
      // Sin almacenamiento (modo privado): el carrito vive mientras dure la pestaña.
    }
  }, []);

  const valor = useMemo(() => ({ carritos, guardar }), [carritos, guardar]);
  return <Contexto value={valor}>{children}</Contexto>;
}

// Sin cuenta de mesa (todavía no está activa) el carrito queda vacío.
export function useCarrito(cuentaMesaId: string | null) {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useCarrito se usa dentro de ProveedorCarrito');
  const { carritos, guardar } = contexto;
  const lineas = cuentaMesaId ? (carritos[cuentaMesaId] ?? leer(cuentaMesaId)) : [];

  function cambiarLineas(nuevas: LineaCarrito[]) {
    if (cuentaMesaId) guardar(cuentaMesaId, nuevas);
  }

  return {
    lineas,
    total: lineas.reduce((t, l) => t + l.plato.precio * l.cantidad, 0),
    unidades: lineas.reduce((t, l) => t + l.cantidad, 0),
    cantidadDe: (platoId: string) =>
      lineas.filter((l) => l.plato.id === platoId).reduce((t, l) => t + l.cantidad, 0),

    // El mismo plato con las mismas observaciones suma cantidad en su línea.
    agregar(plato: PlatoCarrito, cantidad: number, observaciones = '') {
      const nota = observaciones.trim();
      const existente = lineas.findIndex(
        (l) => l.plato.id === plato.id && l.observaciones === nota,
      );
      if (existente === -1) {
        cambiarLineas([...lineas, { plato, cantidad, observaciones: nota }]);
      } else {
        cambiarLineas(
          lineas.map((l, i) =>
            i === existente
              ? { ...l, cantidad: Math.min(MAX_CANTIDAD_LINEA, l.cantidad + cantidad) }
              : l,
          ),
        );
      }
    },
    cambiar(indice: number, cambios: Partial<Omit<LineaCarrito, 'plato'>>) {
      cambiarLineas(lineas.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
    },
    quitar(indice: number) {
      cambiarLineas(lineas.filter((_, i) => i !== indice));
    },
    vaciar() {
      cambiarLineas([]);
    },
  };
}
