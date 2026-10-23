/// <reference types="webxr" />
import {
  Box3,
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// RA propia sobre WebXR (CU-10, Android). A diferencia del modo de model-viewer,
// el plato no aparece flotando: un anillo sigue el punto de la mesa al que
// apunta el centro de la pantalla y, al tocar, el plato se apoya con el centro
// de su base en ese punto, a escala real. Tocar de nuevo lo mueve.

export async function soportaRaWebXR(): Promise<boolean> {
  try {
    return (await navigator.xr?.isSessionSupported('immersive-ar')) ?? false;
  } catch {
    return false;
  }
}

export interface OpcionesRa {
  urlModelo: string;
  escalaReal: number;
  // Capa HTML que se muestra sobre la cámara (instrucciones y botón Salir).
  overlay: HTMLElement;
  onEstado(estado: 'buscando' | 'apuntando' | 'colocado'): void;
  onFin(): void;
  // Solo para pruebas en el celular (?diag en la URL): datos del dibujado.
  onDiagnostico?(texto: string): void;
}

// Sombra suave bajo el plato, para que no parezca flotar.
function crearSombra(radio: number): Mesh {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 128;
  const ctx = lienzo.getContext('2d')!;
  const degradado = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  degradado.addColorStop(0, 'rgba(0,0,0,0.45)');
  degradado.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, 128, 128);
  const sombra = new Mesh(
    new CircleGeometry(radio, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: new CanvasTexture(lienzo), transparent: true, depthWrite: false }),
  );
  sombra.position.y = 0.001;
  return sombra;
}

// El modelo queda dentro de un grupo con el origen en el centro de su base.
async function cargarPlato(url: string, escala: number): Promise<Group> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const caja = new Box3().setFromObject(gltf.scene);
  const centro = caja.getCenter(new Vector3());
  gltf.scene.position.set(-centro.x, -caja.min.y, -centro.z);

  const plato = new Group();
  plato.add(gltf.scene);
  const tamano = caja.getSize(new Vector3());
  plato.add(crearSombra((Math.max(tamano.x, tamano.z) / 2) * 1.15));
  plato.scale.setScalar(escala);
  plato.visible = false;
  return plato;
}

// Anillo con borde oscuro y punto verde: se tiene que ver también sobre un
// plato blanco.
function crearAnillo(): Group {
  const plano = (geometria: RingGeometry | CircleGeometry, material: MeshBasicMaterial) =>
    new Mesh(geometria.rotateX(-Math.PI / 2), material);
  const anillo = new Group();
  anillo.add(
    plano(
      new RingGeometry(0.03, 0.055, 48),
      new MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.55 }),
    ),
    plano(new RingGeometry(0.036, 0.048, 48), new MeshBasicMaterial({ color: 0xffffff })),
    plano(new CircleGeometry(0.009, 24), new MeshBasicMaterial({ color: 0x22c55e })),
  );
  anillo.matrixAutoUpdate = false;
  anillo.visible = false;
  return anillo;
}

// Con superficies lisas (un plato blanco) la detección va y viene: el anillo
// se mantiene en el último punto un rato para que se pueda tocar.
const MS_SIN_SUPERFICIE = 700;

// three usa WebXR Layers (XRProjectionLayer) si el navegador los trae, pero en
// la RA de Chrome para Android esa capa no se mezcla con la cámara: se dibuja y
// no se ve. Mientras three arma la sesión se oculta esa API para que use la
// capa clásica (XRWebGLLayer), la que funciona en todos los navegadores.
async function conCapaClasica<T>(armar: () => Promise<T>): Promise<T> {
  const prototipo = typeof XRWebGLBinding === 'undefined' ? null : XRWebGLBinding.prototype;
  const original = prototipo && Object.getOwnPropertyDescriptor(prototipo, 'createProjectionLayer');
  if (original) delete (prototipo as Partial<XRWebGLBinding>).createProjectionLayer;
  try {
    return await armar();
  } finally {
    if (original) Object.defineProperty(prototipo, 'createProjectionLayer', original);
  }
}

// Abre la sesión. Si el navegador la rechaza (por ejemplo, sin permiso de
// cámara) la promesa falla y el visor muestra el respaldo (E2).
export async function iniciarRa(opciones: OpcionesRa): Promise<() => void> {
  const { urlModelo, escalaReal, overlay, onEstado, onFin, onDiagnostico } = opciones;
  const plato = await cargarPlato(urlModelo, escalaReal);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');

  const escena = new Scene();
  escena.add(new HemisphereLight(0xffffff, 0x8899aa, 2.5));
  const sol = new DirectionalLight(0xffffff, 1.5);
  sol.position.set(0.5, 1, 0.3);
  escena.add(sol);
  const anillo = crearAnillo();
  escena.add(anillo, plato);
  const camara = new PerspectiveCamera();

  const matriz = new Matrix4();
  let fuenteImpacto: XRHitTestSource | null = null;
  let ultimaSuperficie = -Infinity;
  let cuadros = 0;

  // El loop se registra antes de abrir la sesión, como en los ejemplos de
  // three.js: así three corta su loop del navegador al empezar la sesión y
  // solo se dibuja dentro de los cuadros de WebXR.
  renderer.setAnimationLoop((tiempo, cuadro?: XRFrame) => {
    if (!cuadro) return;
    const espacio = renderer.xr.getReferenceSpace();
    const impacto = fuenteImpacto ? cuadro.getHitTestResults(fuenteImpacto)[0] : undefined;
    const pose = espacio ? impacto?.getPose(espacio) : undefined;
    if (pose) {
      anillo.matrix.copy(matriz.fromArray(pose.transform.matrix));
      ultimaSuperficie = tiempo;
    }
    const apuntando = tiempo - ultimaSuperficie < MS_SIN_SUPERFICIE;
    if (!plato.visible && apuntando !== anillo.visible) {
      onEstado(apuntando ? 'apuntando' : 'buscando');
    }
    anillo.visible = apuntando;
    renderer.render(escena, camara);
    if (onDiagnostico && ++cuadros % 30 === 0) {
      const capa = renderer.xr.getBaseLayer();
      onDiagnostico(
        [
          `cuadros ${cuadros}`,
          `triángulos ${renderer.info.render.triangles}`,
          `capa ${capa ? capa.constructor.name : 'ninguna'}`,
          `error GL ${renderer.getContext().getError()}`,
          `anillo ${anillo.visible ? 'sí' : 'no'}`,
          `plato ${plato.visible ? 'sí' : 'no'}`,
        ].join(' · '),
      );
    }
  });

  let sesion: XRSession;
  try {
    sesion = await navigator.xr!.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay },
    });
  } catch (e) {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    throw e;
  }
  try {
    await conCapaClasica(() => renderer.xr.setSession(sesion));
    const espacioVisor = await sesion.requestReferenceSpace('viewer');
    fuenteImpacto = (await sesion.requestHitTestSource!({ space: espacioVisor })) ?? null;
  } catch (e) {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    await sesion.end().catch(() => undefined);
    throw e;
  }
  onEstado('buscando');

  const punto = new Vector3();
  const posicionCamara = new Vector3();

  sesion.addEventListener('select', () => {
    if (!anillo.visible) return;
    punto.setFromMatrixPosition(anillo.matrix);
    plato.position.copy(punto);
    // El plato mira hacia el comensal.
    renderer.xr.getCamera().getWorldPosition(posicionCamara);
    plato.rotation.y = Math.atan2(posicionCamara.x - punto.x, posicionCamara.z - punto.z);
    plato.visible = true;
    onEstado('colocado');
  });

  sesion.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    fuenteImpacto?.cancel();
    renderer.dispose();
    onFin();
  });

  return () => void sesion.end().catch(() => undefined);
}
