import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sesionSchema, type CodigoPermiso, type Sesion } from '@pgim/shared';
import { ApiError, api } from '../lib/api';

interface SesionContexto {
  sesion: Sesion | null;
  cargando: boolean;
  login(email: string, password: string): Promise<Sesion>;
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
