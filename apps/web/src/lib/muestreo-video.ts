import { aLuminancia, type MetadatosVideo, type MuestraCuadro } from '@pgim/shared';

const ANCHO_MUESTRA = 320;
const ESPERA_MS = 5000;
const MENSAJE =
  'No pudimos leer el video. Si lo grabaste con un iPhone, probá subirlo desde el mismo celular.';

function esperar(video: HTMLVideoElement, evento: string): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const limpiar = () => {
      clearTimeout(timer);
      video.removeEventListener(evento, alEvento);
      video.removeEventListener('error', alError);
    };
    const alEvento = () => (limpiar(), resolver());
    const alError = () => (limpiar(), rechazar(new Error(MENSAJE)));
    const timer = setTimeout(alError, ESPERA_MS);
    video.addEventListener(evento, alEvento);
    video.addEventListener('error', alError);
  });
}

// Lee la duración y la resolución del video y saca `cantidad` cuadros repartidos
// entre el 5 % y el 95 % de la duración, ya en luminancia, para evaluar la calidad.
export async function muestrearVideo(
  archivo: File,
  cantidad = 30,
  onAvance?: (hechos: number, total: number) => void,
): Promise<{ metadatos: MetadatosVideo; muestras: MuestraCuadro[] }> {
  const url = URL.createObjectURL(archivo);
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const metadatosListos = esperar(video, 'loadedmetadata');
    video.src = url;
    await metadatosListos;

    const { videoWidth: ancho, videoHeight: alto, duration: duracionS } = video;
    if (!ancho || !alto || !Number.isFinite(duracionS) || duracionS <= 0) {
      throw new Error(MENSAJE);
    }

    const anchoMuestra = Math.min(ANCHO_MUESTRA, ancho);
    const altoMuestra = Math.max(1, Math.round((alto * anchoMuestra) / ancho));
    const canvas = document.createElement('canvas');
    canvas.width = anchoMuestra;
    canvas.height = altoMuestra;
    const contexto = canvas.getContext('2d', { willReadFrequently: true });
    if (!contexto) throw new Error(MENSAJE);

    const muestras: MuestraCuadro[] = [];
    for (let i = 0; i < cantidad; i++) {
      const fraccion = cantidad === 1 ? 0.5 : 0.05 + (0.9 * i) / (cantidad - 1);
      const buscado = esperar(video, 'seeked');
      video.currentTime = duracionS * fraccion;
      await buscado;
      contexto.drawImage(video, 0, 0, anchoMuestra, altoMuestra);
      const { data } = contexto.getImageData(0, 0, anchoMuestra, altoMuestra);
      muestras.push(aLuminancia(data, anchoMuestra, altoMuestra));
      onAvance?.(i + 1, cantidad);
    }
    return { metadatos: { ancho, alto, duracionS }, muestras };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
