import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sesionSchema, type CodigoPermiso, type RegistroComensal, type Sesion } from '@pgim/shared';
import { ApiError, api } from '../lib/api';
import { reconectarSocket } from '../lib/socket';

interface SesionContexto {
  sesion: Sesion | null;
  cargando: boolean;
  login(email: string, password: string): Promise<Sesion>;
  // Alta de comensal: queda con la sesión iniciada.
  registrar(datos: RegistroComensal): Promise<Sesion>;
  logout(): Promise<void>;
  seleccionarSucursal(sucursalId: string): Promise<Sesion>;
  // Vuelve a leer la sesión: después de cambiar roles, personal o sucursales,
  // los permisos y las sucursales del propio usuario pueden haber cambiado.
  recargarSesion(): Promise<void>;
  tienePermiso(codigo: CodigoPermiso): boolean;
}

const Contexto = createContext<SesionContexto | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargarSesion = useCallback(async () => {
    try {
      setSesion(sesionSchema.parse(await api<unknown>('/auth/sesion')));
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) console.error(error);
      setSesion(null);
    }
  }, []);

  useEffect(() => {
    recargarSesion().finally(() => setCargando(false));
  }, [recargarSesion]);

  // El socket se autentica al conectarse: si cambia quién es o dónde trabaja,
  // se reconecta con la cookie nueva.
  const usuarioId = sesion?.usuario.id;
  const sucursalActivaId = sesion?.sucursalActiva?.id;
  useEffect(() => {
    reconectarSocket(usuarioId !== undefined);
  }, [usuarioId, sucursalActivaId]);

  const guardar = useCallback((datos: unknown) => {
    const nueva = sesionSchema.parse(datos);
    setSesion(nueva);
    return nueva;
  }, []);

  const valor = useMemo<SesionContexto>(
    () => ({
      sesion,
      cargando,
      login: async (email, password) =>
        guardar(await api('/auth/login', { method: 'POST', body: { email, password } })),
      registrar: async (datos) =>
        guardar(await api('/auth/registro', { method: 'POST', body: datos })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' });
        setSesion(null);
      },
      seleccionarSucursal: async (sucursalId) =>
        guardar(await api('/auth/sucursal', { method: 'POST', body: { sucursalId } })),
      recargarSesion,
      tienePermiso: (codigo) => sesion?.permisos.includes(codigo) ?? false,
    }),
    [sesion, cargando, guardar, recargarSesion],
  );

  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): SesionContexto {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return contexto;
}

// Pantalla de inicio que corresponde a cada sesión.
export function rutaInicio(sesion: Sesion): string {
  if (sesion.usuario.tipo === 'COMENSAL') return '/inicio';
  return sesion.sucursalActiva ? '/panel' : '/sucursal';
}

// La página que pidió el login (RutaProtegida la deja en el state), si es para
// el mismo tipo de usuario que entró.
interface Destino {
  desde?: string;
  tipo?: Sesion['usuario']['tipo'];
}

export function destinoTrasLogin(sesion: Sesion, state: unknown): string {
  const { desde, tipo } = (state ?? {}) as Destino;
  return desde && tipo === sesion.usuario.tipo ? desde : rutaInicio(sesion);
}
