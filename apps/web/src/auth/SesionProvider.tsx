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
  tienePermiso(codigo: CodigoPermiso): boolean;
}

const Contexto = createContext<SesionContexto | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<unknown>('/auth/sesion')
      .then((datos) => setSesion(sesionSchema.parse(datos)))
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) console.error(error);
        setSesion(null);
      })
      .finally(() => setCargando(false));
  }, []);

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
      tienePermiso: (codigo) => sesion?.permisos.includes(codigo) ?? false,
    }),
    [sesion, cargando, guardar],
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
