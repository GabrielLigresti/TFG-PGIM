import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { TriangleAlert, CircleCheck, X, type LucideIcon } from 'lucide-react';
import { infoEstado, type EntidadConEstado, type Publico, type Tono } from '../lib/estados';

// Piezas visuales comunes. Los colores salen de los tokens de index.css.

// Dónde se usa la pantalla: escritorio, tablet de cocina y salón, o celular del comensal.
export type Densidad = 'compacta' | 'tactil' | 'comensal';

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

// En el celular el texto va a 16 px: con menos, iOS hace zoom al enfocar el campo.
export const claseInput =
  'w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-text sm:min-h-9 sm:text-sm focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 disabled:bg-panel disabled:text-meta';

type Variante = 'principal' | 'secundario' | 'tonal' | 'peligro' | 'fantasma';

const VARIANTES: Record<Variante, string> = {
  principal:
    'border border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover',
  secundario: 'border border-line-strong bg-surface text-text hover:bg-panel',
  tonal: 'border border-accent/20 bg-accent-soft text-accent-ink hover:bg-accent/15',
  peligro: 'border border-bad/30 bg-surface text-bad hover:bg-bad-soft',
  fantasma: 'border border-transparent bg-transparent text-meta hover:bg-panel hover:text-text',
};

const ALTURAS: Record<Densidad, string> = {
  compacta: 'min-h-11 px-3 text-sm sm:min-h-9',
  comensal: 'min-h-11 px-4 text-sm font-semibold',
  tactil: 'min-h-12 px-4 text-base font-semibold',
};

// Un solo botón principal por pantalla; las acciones repetidas en filas o tarjetas van en tonal.
export function Boton({
  variante = 'principal',
  densidad = 'compacta',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; densidad?: Densidad }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${ALTURAS[densidad]} ${className}`}
    />
  );
}

// La etiqueta se asocia al control por id (y no envolviéndolo) para que el
// nombre accesible sea solo la etiqueta, sin el texto de las opciones.
export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className = '',
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripcion = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ');
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        ...(descripcion && { 'aria-describedby': descripcion }),
        ...(error && { 'aria-invalid': true }),
      })
    : children;
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {etiqueta}
      </label>
      {control}
      {ayuda && (
        <p id={idAyuda} className="text-xs text-meta">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="flex items-center gap-1 text-xs text-bad">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
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
    <label className="flex min-h-9 items-center gap-2 text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line-strong accent-accent"
      />
      {etiqueta}
    </label>
  );
}

const CLASES_AVISO = {
  ok: { clase: 'border-ok/30 bg-ok-soft text-ok', icono: CircleCheck },
  bad: { clase: 'border-bad/30 bg-bad-soft text-bad', icono: TriangleAlert },
};

// Mensaje dentro de la pantalla. Por defecto, un error.
export function Aviso({ children, tono = 'bad' }: { children: ReactNode; tono?: 'ok' | 'bad' }) {
  if (!children) return null;
  const { clase, icono: Icono } = CLASES_AVISO[tono];
  return (
    <p
      role={tono === 'bad' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-panel border px-3 py-2 text-sm ${clase}`}
    >
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const CLASES_TONO: Record<Tono, string> = {
  neutro: 'border border-line-strong bg-surface text-meta',
  acento: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
};

const claseEtiqueta =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold';

// Marca corta (Dado de baja, Sin receta…). Para estados del dominio, usar Estado.
export function Etiqueta({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`${claseEtiqueta} ${CLASES_TONO[tono]}`}>{children}</span>;
}

// Estado de una entidad, siempre con ícono y texto, según lib/estados.ts.
export function Estado({
  entidad,
  valor,
  publico,
}: {
  entidad: EntidadConEstado;
  valor: string;
  publico?: Publico;
}) {
  const { etiqueta, tono, icono: Icono } = infoEstado(entidad, valor, publico);
  return (
    <span className={`${claseEtiqueta} ${CLASES_TONO[tono]}`}>
      <Icono aria-hidden className="size-3.5" strokeWidth={2.4} />
      {etiqueta}
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
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">
          {titulo}
        </h1>
        {descripcion && <p className="text-sm text-meta">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

// Contenedor con borde: lo apoyado lleva borde, no sombra.
export function Panel({
  titulo,
  accion,
  children,
  className = '',
}: {
  titulo?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-panel border border-line bg-surface p-4 ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-lg font-semibold text-ink">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro',
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: 'neutro' | 'warn';
}) {
  const color = tono === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="grid gap-0.5 rounded-panel border border-line bg-panel px-3 py-2.5">
      <span className="text-xs text-meta">{etiqueta}</span>
      <span className={`text-xl font-semibold ${color}`}>{valor}</span>
      {detalle && (
        <span
          className={`flex items-center gap-1 text-xs ${tono === 'warn' ? 'text-warn' : 'text-meta'}`}
        >
          {tono === 'warn' && <TriangleAlert aria-hidden className="size-3.5" />}
          {detalle}
        </span>
      )}
    </div>
  );
}

// Estado vacío: qué falta y cómo empezar.
export function Vacio({
  icono: Icono,
  titulo,
  texto,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-panel border border-dashed border-line-strong px-4 py-8 text-center">
      <Icono aria-hidden className="size-7 text-meta" strokeWidth={1.6} />
      <p className="font-semibold text-ink">{titulo}</p>
      {texto && <p className="max-w-sm text-sm text-meta">{texto}</p>}
      {accion}
    </div>
  );
}

// Selector de 2 a 4 opciones (Almuerzo / Cena, cambio de vista). Se mueve con las flechas.
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambiar(valor: T): void;
  etiqueta: string;
}) {
  function alPresionar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = opciones.findIndex((o) => o.valor === valor);
    const paso = e.key === 'ArrowRight' ? 1 : -1;
    const siguiente = opciones[(i + paso + opciones.length) % opciones.length];
    if (!siguiente) return;
    onCambiar(siguiente.valor);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-valor="${siguiente.valor}"]`)?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      onKeyDown={alPresionar}
      className="inline-flex max-w-full gap-1 rounded-panel border border-line-strong bg-surface p-1"
    >
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa ? 0 : -1}
            data-valor={o.valor}
            onClick={() => onCambiar(o.valor)}
            className={`min-h-9 rounded-control px-3 text-sm sm:min-h-8 ${
              activa ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-meta hover:text-text'
            }`}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

// Filtros y categorías.
export function Chip({
  seleccionado,
  onClick,
  children,
}: {
  seleccionado: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={seleccionado}
      onClick={onClick}
      className={`min-h-9 whitespace-nowrap rounded-full border px-3 text-sm font-medium ${
        seleccionado
          ? 'border-accent bg-accent text-white'
          : 'border-line-strong bg-surface text-text hover:bg-panel'
      }`}
    >
      {children}
    </button>
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
    const alPresionar = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    document.addEventListener('keydown', alPresionar);
    return () => {
      document.removeEventListener('keydown', alPresionar);
      anterior?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-stretch justify-center bg-ink/40 sm:items-center sm:p-4">
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col bg-surface shadow-flotante outline-none sm:rounded-panel ${ancho}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 className="min-w-0 text-lg font-semibold text-ink">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-10 shrink-0 items-center justify-center rounded-control text-meta hover:bg-panel"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function EstadoCarga({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (error) return <Aviso>{error}</Aviso>;
  if (cargando) return <p className="text-sm text-meta">Cargando…</p>;
  return null;
}
