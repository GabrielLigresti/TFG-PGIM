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

function crearAnillo(): Mesh {
  const anillo = new Mesh(
    new RingGeometry(0.035, 0.045, 40).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  anillo.add(new Mesh(new CircleGeometry(0.006, 16).rotateX(-Math.PI / 2), anillo.material));
  anillo.matrixAutoUpdate = false;
  anillo.visible = false;
  return anillo;
}

// Abre la sesión. Si el navegador la rechaza (por ejemplo, sin permiso de
// cámara) la promesa falla y el visor muestra el respaldo (E2).
export async function iniciarRa(opciones: OpcionesRa): Promise<() => void> {
  const { urlModelo, escalaReal, overlay, onEstado, onFin } = opciones;
  const plato = await cargarPlato(urlModelo, escalaReal);

  const sesion = await navigator.xr!.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'local'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: overlay },
  });

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  let fuenteImpacto: XRHitTestSource;
  try {
    await renderer.xr.setSession(sesion);
    const espacioVisor = await sesion.requestReferenceSpace('viewer');
    fuenteImpacto = (await sesion.requestHitTestSource!({ space: espacioVisor }))!;
  } catch (e) {
    renderer.dispose();
    await sesion.end().catch(() => undefined);
    throw e;
  }

  const escena = new Scene();
  escena.add(new HemisphereLight(0xffffff, 0x8899aa, 2.5));
  const sol = new DirectionalLight(0xffffff, 1.5);
  sol.position.set(0.5, 1, 0.3);
  escena.add(sol);
  const anillo = crearAnillo();
  escena.add(anillo, plato);
  const camara = new PerspectiveCamera();

  onEstado('buscando');

  const punto = new Vector3();
  const posicionCamara = new Vector3();
  const matriz = new Matrix4();

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

  let apuntando = false;
  renderer.setAnimationLoop((_tiempo, cuadro?: XRFrame) => {
    const espacio = renderer.xr.getReferenceSpace();
    const impacto = cuadro?.getHitTestResults(fuenteImpacto)[0];
    const pose = espacio ? impacto?.getPose(espacio) : undefined;
    anillo.visible = Boolean(pose);
    if (pose) anillo.matrix.copy(matriz.fromArray(pose.transform.matrix));
    if (!plato.visible && Boolean(pose) !== apuntando) onEstado(pose ? 'apuntando' : 'buscando');
    apuntando = Boolean(pose);
    renderer.render(escena, camara);
  });

  sesion.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    fuenteImpacto.cancel();
    renderer.dispose();
    onFin();
  });

  return () => void sesion.end().catch(() => undefined);
}
