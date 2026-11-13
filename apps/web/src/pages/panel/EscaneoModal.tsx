import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Box, Check, Loader, Video } from 'lucide-react';
import {
  LIMITE_VIDEO_MB,
  diametroPorEscala,
  escalaPorDiametro,
  evaluarCalidad,
  type Escaneo,
  type InformeCalidad as Informe,
  type ModeloRaInput,
  type Plato,
  type UmbralesCalidad,
} from '@pgim/shared';
import { useConfirmar } from '../../components/Confirmacion';
import {
  Aviso,
  Boton,
  Campo,
  Etiqueta,
  Modal,
  Vacio,
  claseInput,
  propsDecimal,
} from '../../components/ui';
import { ApiError, api, enviarVideo } from '../../lib/api';
import { aNumero } from '../../lib/formato';
import { muestrearVideo } from '../../lib/muestreo-video';
import { useEscaneo } from '../../lib/useEscaneo';
import { useModelViewer } from '../../lib/useModelViewer';
import { InformeCalidad } from './InformeCalidad';

type Modo = 'inicio' | 'elegir' | 'revisando' | 'informe';
type Dimensiones = { src: string; ancho: number; profundidad: number };

const CUADROS = 30;
const CLAVE_FALLA_VISTA = 'pgim:escaneo-falla-vista:';

// localStorage puede no estar disponible (modo privado, cuota): nunca debe romper la pantalla.
function fallaYaVista(id: string): boolean {
  try {
    return localStorage.getItem(CLAVE_FALLA_VISTA + id) !== null;
  } catch {
    return false;
  }
}

function recordarFallaVista(id: string) {
  try {
    localStorage.setItem(CLAVE_FALLA_VISTA + id, '1');
  } catch {
    // Sin almacenamiento, el aviso se oculta solo durante esta apertura del modal.
  }
}

// Pie del modal: en el celular los botones se apilan a ancho completo con el
// principal arriba (por eso el principal va último); en escritorio van en fila.
function Pie({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
      {children}
    </div>
  );
}

// Vista previa del modelo. model-viewer 4.4 tira un error si se cambia el modelo
// en vivo, así que la clave remonta el visor. Las medidas se leen con escala 1
// al terminar de cargar: la escala real sale del diámetro que indica el restaurante.
function Vista({
  src,
  nombre,
  borrador,
  onMedidas,
}: {
  src: string;
  nombre: string;
  borrador?: boolean;
  onMedidas(d: Dimensiones): void;
}) {
  const listo = useModelViewer();
  const visor = useRef<HTMLElementTagNameMap['model-viewer']>(null);
  const alMedir = useRef(onMedidas);
  useEffect(() => {
    alMedir.current = onMedidas;
  });

  useEffect(() => {
    const el = visor.current;
    if (!el) return;
    const leer = () => {
      const { x, z } = el.getDimensions();
      if (x > 0 || z > 0) alMedir.current({ src, ancho: x, profundidad: z });
    };
    el.addEventListener('load', leer);
    if (el.loaded) leer();
    return () => el.removeEventListener('load', leer);
  }, [src, listo]);

  return (
    <div className="relative">
      {listo ? (
        <model-viewer
          key={src}
          ref={visor}
          src={src}
          alt={`Vista previa de ${nombre}`}
          camera-controls
          touch-action="pan-y"
          style={{
            width: '100%',
            height: '16rem',
            background: 'var(--color-panel)',
            borderRadius: 10,
          }}
        />
      ) : (
        <div className="h-64 rounded-control bg-panel" />
      )}
      {borrador && (
        <span className="absolute left-2 top-2">
          <Etiqueta tono="warn">Borrador</Etiqueta>
        </span>
      )}
    </div>
  );
}

// CU-16, modelo 3D del plato: se escanea con un video, se revisa la calidad antes
// de enviarlo, se espera el modelo y se revisa el borrador antes de publicarlo.
export function EscaneoModal({
  plato,
  onCerrar,
  onCambio,
}: {
  plato: Plato;
  onCerrar(): void;
  onCambio(): void;
}) {
  const actual = plato.modeloRa;
  const { escaneo, error: errorConsulta, recargar } = useEscaneo(plato.id);
  const confirmar = useConfirmar();

  const [modo, setModo] = useState<Modo>('inicio');
  const [avance, setAvance] = useState(0);
  const [video, setVideo] = useState<File | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [diametro, setDiametro] = useState('');
  const [porcion, setPorcion] = useState(actual ? String(actual.porcionGramos) : '');
  const [medidas, setMedidas] = useState<Dimensiones | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoNoEnviado, setAvisoNoEnviado] = useState(false);
  // Escaneos fallidos cuyo aviso se cerró en esta apertura (cubre también si localStorage falla).
  const [fallasCerradas, setFallasCerradas] = useState<string[]>([]);

  const estado = escaneo?.estado;
  const vista =
    escaneo === undefined
      ? 'cargando'
      : estado === 'PENDIENTE' || estado === 'PROCESANDO'
        ? 'generando'
        : estado === 'EN_REVISION'
          ? 'revision'
          : modo;
  const urlVista = vista === 'revision' ? escaneo?.urlModelo : (actual?.urlModelo ?? null);
  const medidasVista = medidas && medidas.src === urlVista ? medidas : null;

  // Cuando el modelo termina de generarse, la lista de Platos se entera.
  const estadoPrevio = useRef(estado);
  useEffect(() => {
    if (estadoPrevio.current !== estado && estadoPrevio.current !== undefined) onCambio();
    estadoPrevio.current = estado;
  });

  // Cuando manda el estado del escaneo (generando o para revisar), lo del video anterior ya
  // no aplica: ni su informe ni el error de ese envío. Si el escaneo falla, se vuelve al inicio.
  // El aviso de "no se envió" sí se conserva. Va en un efecto de layout para que un error viejo
  // no llegue a pintarse en la vista de revisión.
  const mandaElEscaneo = vista === 'generando' || vista === 'revision';
  useLayoutEffect(() => {
    if (!mandaElEscaneo) return;
    setModo('inicio');
    setVideo(null);
    setInforme(null);
    setError(null);
  }, [mandaElEscaneo]);

  // El último escaneo fallido se avisa hasta que el usuario lo cierra, tenga o no modelo el plato.
  const fallaVisible =
    escaneo?.estado === 'FALLIDO' &&
    !fallasCerradas.includes(escaneo.id) &&
    !fallaYaVista(escaneo.id)
      ? escaneo
      : null;

  function cerrarFalla(id: string) {
    recordarFallaVista(id);
    setFallasCerradas((ids) => [...ids, id]);
  }

  // Cada vista empieza con su propio diámetro: el borrador no hereda el del modelo publicado.
  const precargado = useRef<string | null>(null);
  useEffect(() => {
    setDiametro('');
    precargado.current = null;
  }, [vista]);

  // El diámetro inicial del modelo publicado se deduce de su escala guardada, una sola vez
  // por modelo: si después se vacía el campo, no se vuelve a completar.
  useEffect(() => {
    if (vista !== 'inicio' || !actual || !medidasVista) return;
    if (precargado.current === actual.urlModelo) return;
    precargado.current = actual.urlModelo;
    const cm = diametroPorEscala(actual.escalaReal, medidasVista.ancho, medidasVista.profundidad);
    setDiametro(String(cm).replace('.', ','));
  }, [vista, actual, medidasVista]);

  function datosMedidas(): ModeloRaInput | string {
    const cm = aNumero(diametro);
    const gramos = aNumero(porcion);
    if (!Number.isFinite(cm) || cm <= 0) return 'Indicá el diámetro del plato';
    if (!medidasVista) return 'Esperá a que cargue la vista previa para guardar';
    return {
      escalaReal: escalaPorDiametro(cm, medidasVista.ancho, medidasVista.profundidad),
      porcionGramos: gramos,
    };
  }

  async function ejecutar(accion: () => Promise<void>, falla: string) {
    setEnviando(true);
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : falla);
    } finally {
      setEnviando(false);
    }
  }

  function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = datosMedidas();
    if (typeof datos === 'string') return setError(datos);
    void ejecutar(async () => {
      await api(`/platos/${plato.id}/modelo-ra`, { method: 'PUT', body: datos });
      onCambio();
      onCerrar();
    }, 'No se pudo guardar el modelo');
  }

  function publicar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = datosMedidas();
    if (!escaneo) return;
    if (typeof datos === 'string') return setError(datos);
    void ejecutar(async () => {
      await api(`/escaneos/${escaneo.id}/publicar`, { method: 'POST', body: datos });
      setAvisoNoEnviado(false);
      onCambio();
      onCerrar();
    }, 'No se pudo publicar el modelo');
  }

  async function descartar() {
    if (!escaneo) return;
    if (
      !(await confirmar({
        mensaje: `¿Descartar el modelo nuevo de ${plato.nombre}?`,
        detalle: 'Se borra el borrador. Si el plato ya tenía un modelo, se queda con ese.',
        accion: 'Descartar',
      }))
    )
      return;
    void ejecutar(async () => {
      await api(`/escaneos/${escaneo.id}/descartar`, { method: 'POST' });
      setAvisoNoEnviado(false);
      setModo('inicio');
      recargar();
      onCambio();
    }, 'No se pudo descartar el modelo');
  }

  async function quitar() {
    if (
      !(await confirmar({
        mensaje: `¿Quitar el modelo 3D de ${plato.nombre}?`,
        detalle:
          'Se borra el modelo y el plato deja de mostrar "Ver en mi mesa". No se puede deshacer.',
        accion: 'Quitar modelo',
      }))
    )
      return;
    void ejecutar(async () => {
      await api(`/platos/${plato.id}/modelo-ra`, { method: 'DELETE' });
      onCambio();
      onCerrar();
    }, 'No se pudo quitar el modelo');
  }

  async function revisarVideo(archivo: File) {
    setError(null);
    if (archivo.size > LIMITE_VIDEO_MB * 1024 * 1024) {
      return setError(`El video supera los ${LIMITE_VIDEO_MB} MB`);
    }
    setVideo(archivo);
    setAvance(0);
    setModo('revisando');
    try {
      const [muestreo, umbrales] = await Promise.all([
        muestrearVideo(archivo, CUADROS, (hechos) => setAvance(hechos)),
        api<UmbralesCalidad>('/escaneos/requisitos'),
      ]);
      setInforme(evaluarCalidad(muestreo.muestras, muestreo.metadatos, umbrales));
      setModo('informe');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos leer el video');
      setModo('elegir');
    }
  }

  function enviar() {
    if (!video || !informe) return;
    void ejecutar(async () => {
      try {
        await enviarVideo<Escaneo>(`/platos/${plato.id}/escaneos`, video, informe);
      } catch (e) {
        // Un escaneo que ya estaba en curso: se muestra ese en vez del informe y se avisa
        // que este video no se envió.
        if (e instanceof ApiError && e.status === 409) {
          setAvisoNoEnviado(true);
          recargar();
          return;
        }
        throw e;
      }
      setVideo(null);
      setInforme(null);
      setModo('inicio');
      recargar();
      onCambio();
    }, 'No se pudo enviar el video');
  }

  function grabarDeNuevo() {
    setVideo(null);
    setInforme(null);
    setError(null);
    setModo('elegir');
  }

  const camposMedidas = (
    <div className="grid grid-cols-2 gap-3">
      <Campo etiqueta="Diámetro del plato (cm)">
        <input
          {...propsDecimal}
          required
          value={diametro}
          onChange={(e) => setDiametro(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Campo etiqueta="Porción (g)">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          required
          value={porcion}
          onChange={(e) => setPorcion(e.target.value)}
          className={claseInput}
        />
      </Campo>
    </div>
  );

  const avisoNoEnviadoTexto = (
    <Aviso>
      {avisoNoEnviado
        ? 'Ya había un escaneo en curso para este plato. Tu video no se envió.'
        : null}
    </Aviso>
  );

  const cuerpo = (() => {
    switch (vista) {
      case 'cargando':
        return <p className="text-sm text-meta">{errorConsulta ?? 'Cargando…'}</p>;

      case 'generando':
        return (
          <>
            {avisoNoEnviadoTexto}
            <div className="grid h-64 place-content-center justify-items-center gap-2 text-center">
              <Loader aria-hidden className="size-8 text-accent motion-safe:animate-spin" />
              <p className="text-lg font-semibold text-ink">Estamos armando el modelo</p>
              <p className="max-w-[45ch] text-sm text-meta">
                Puede tardar unos minutos. Podés cerrar esta ventana: el plato queda como Generando
                hasta que esté listo.
              </p>
            </div>
            <Pie>
              <Boton variante="secundario" onClick={onCerrar}>
                Cerrar
              </Boton>
            </Pie>
          </>
        );

      case 'elegir':
        return (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
              <li>Poné el plato sobre una mesa, con luz pareja y sin flash</li>
              <li>Grabá una vuelta lenta y completa alrededor, de 30 a 60 segundos</li>
              <li>Mantené el plato entero en cuadro</li>
            </ol>
            <label className="grid cursor-pointer justify-items-center gap-1 rounded-panel border-2 border-dashed border-line-strong px-4 py-8 text-center hover:bg-panel has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20">
              <Video aria-hidden className="size-7 text-meta" strokeWidth={1.6} />
              <span className="font-semibold text-ink">Grabar o elegir un video</span>
              <span className="text-xs text-meta">MP4 o MOV, hasta {LIMITE_VIDEO_MB} MB</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void revisarVideo(archivo);
                }}
                className="sr-only"
              />
            </label>
            <Aviso>{error}</Aviso>
            <Pie>
              <Boton
                variante="secundario"
                onClick={() => {
                  setError(null);
                  setModo('inicio');
                }}
              >
                Volver
              </Boton>
            </Pie>
          </div>
        );

      case 'revisando':
        return (
          <div className="space-y-3 py-6">
            <p className="text-lg font-semibold text-ink">Revisando el video…</p>
            <div
              role="progressbar"
              aria-label="Revisando el video"
              aria-valuemin={0}
              aria-valuemax={CUADROS}
              aria-valuenow={avance}
              className="h-1 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full bg-accent motion-safe:transition-[width]"
                style={{ width: `${(avance / CUADROS) * 100}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-meta">
              {avance} de {CUADROS}
            </p>
          </div>
        );

      case 'informe': {
        if (!informe) return null;
        const nivel = informe.nivelGlobal;
        return (
          <div className="space-y-4">
            <InformeCalidad informe={informe} />
            <Aviso>{error}</Aviso>
            <Pie>
              {nivel === 'OK' && (
                <Boton variante="fantasma" onClick={grabarDeNuevo} disabled={enviando}>
                  Elegir otro
                </Boton>
              )}
              {nivel === 'ADVERTENCIA' && (
                <Boton variante="secundario" onClick={grabarDeNuevo} disabled={enviando}>
                  Grabar de nuevo
                </Boton>
              )}
              {nivel === 'RECHAZO' ? (
                <Boton onClick={grabarDeNuevo}>Grabar de nuevo</Boton>
              ) : (
                <Boton onClick={enviar} disabled={enviando}>
                  {enviando ? 'Enviando…' : nivel === 'OK' ? 'Enviar' : 'Enviar igual'}
                </Boton>
              )}
            </Pie>
          </div>
        );
      }

      case 'revision':
        return (
          <form onSubmit={publicar} className="space-y-4">
            {avisoNoEnviadoTexto}
            {escaneo?.urlModelo && (
              <Vista
                src={escaneo.urlModelo}
                nombre={plato.nombre}
                borrador
                onMedidas={setMedidas}
              />
            )}
            <p className="text-sm text-meta">
              Indicá el diámetro del plato para que se vea en su tamaño real.
            </p>
            {camposMedidas}
            <Aviso>{error}</Aviso>
            <Pie>
              <Boton
                variante="peligro"
                onClick={descartar}
                disabled={enviando}
                className="sm:mr-auto"
              >
                Descartar
              </Boton>
              <Boton type="submit" disabled={enviando}>
                <Check aria-hidden className="size-4" />
                {enviando ? 'Publicando…' : 'Publicar'}
              </Boton>
            </Pie>
          </form>
        );

      default:
        return (
          <form onSubmit={guardar} className="space-y-4">
            {actual ? (
              <Vista src={actual.urlModelo} nombre={plato.nombre} onMedidas={setMedidas} />
            ) : (
              <Vacio icono={Box} titulo="Este plato todavía no tiene modelo 3D" />
            )}
            {actual && camposMedidas}
            <Aviso
              accion={
                fallaVisible && (
                  <Boton variante="fantasma" onClick={() => cerrarFalla(fallaVisible.id)}>
                    Entendido
                  </Boton>
                )
              }
            >
              {fallaVisible &&
                (fallaVisible.error ?? 'No pudimos armar el modelo. Probá de nuevo.')}
            </Aviso>
            <Aviso>{error}</Aviso>
            <Pie>
              {actual && (
                <Boton
                  variante="peligro"
                  onClick={quitar}
                  disabled={enviando}
                  className="sm:mr-auto"
                >
                  Quitar modelo
                </Boton>
              )}
              {actual && (
                <Boton type="submit" variante="secundario" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar'}
                </Boton>
              )}
              <Boton
                onClick={() => {
                  setError(null);
                  setModo('elegir');
                }}
                disabled={enviando}
              >
                <Video aria-hidden className="size-4" />
                Escanear plato
              </Boton>
            </Pie>
          </form>
        );
    }
  })();

  return (
    <Modal titulo={`Modelo 3D: ${plato.nombre}`} onCerrar={onCerrar}>
      <div aria-live="polite">{cuerpo}</div>
    </Modal>
  );
}
