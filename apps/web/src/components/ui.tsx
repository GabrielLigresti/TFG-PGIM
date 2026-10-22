import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

// Piezas visuales comunes de las pantallas de gestión.

// Campo decimal: texto con teclado numérico. Un input type="number" rechaza la
// coma, y el teclado en español del celular (sobre todo en iPhone) la usa como
// separador decimal; aNumero acepta los dos.
export const propsDecimal = {
  type: 'text',
  inputMode: 'decimal',
  autoComplete: 'off',
  pattern: '[0-9]*[.,]?[0-9]+',
  title: 'Usá números; para los decimales, coma o punto',
} as const;

export const claseInput =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-slate-500 focus:outline-none disabled:bg-slate-100';

type Variante = 'primario' | 'secundario' | 'peligro';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-slate-800 text-white hover:bg-slate-700',
  secundario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  peligro: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};

export function Boton({
  variante = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
    />
  );
}

// La etiqueta se asocia al control por id (y no envolviéndolo) para que el
// nombre accesible sea solo la etiqueta, sin el texto de las opciones.
export function Campo({
  etiqueta,
  ayuda,
  children,
  className = '',
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
  className?: string;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const control = isValidElement(children)
    ? cloneElement(children, { id, ...(ayuda && { 'aria-describedby': idAyuda }) })
    : children;
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {control}
      {ayuda && (
        <p id={idAyuda} className="text-xs text-slate-500">
          {ayuda}
        </p>
      )}
    </div>
  );
}

export function Casilla({
  etiqueta,
  checked,
  onChange,
  disabled,
}: {
  etiqueta: string;
  checked: boolean;
  onChange(valor: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-slate-300"
      />
      {etiqueta}
    </label>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

const COLORES_ETIQUETA = {
  gris: 'bg-slate-100 text-slate-600',
  verde: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-800',
  rojo: 'bg-red-50 text-red-700',
};

export function Etiqueta({
  color = 'gris',
  children,
}: {
  color?: keyof typeof COLORES_ETIQUETA;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLORES_ETIQUETA[color]}`}
    >
      {children}
    </span>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
        {descripcion && <p className="text-sm text-slate-500">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

// Panel modal para los formularios de alta y edición. En el celular ocupa toda
// la pantalla; en la PC queda centrado.
export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  onCerrar(): void;
  children: ReactNode;
  ancho?: string;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  // onCerrar suele llegar como función nueva en cada render: se guarda en un
  // ref para que el efecto corra una sola vez y no le robe el foco a un campo.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });

  // Al abrir, el foco pasa al diálogo; al cerrar, vuelve a donde estaba.
  // Escape cierra desde cualquier lugar de la página.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dialogo.current?.focus();
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    document.addEventListener('keydown', alPresionar);
    return () => {
      document.removeEventListener('keydown', alPresionar);
      anterior?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col bg-white shadow-lg outline-none sm:rounded-xl ${ancho}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function EstadoCarga({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (error) return <Aviso>{error}</Aviso>;
  if (cargando) return <p className="text-sm text-slate-500">Cargando…</p>;
  return null;
}
