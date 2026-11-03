import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { CodigoPermiso, Sesion } from '@pgim/shared';
import { rutaInicio, useSesion } from './SesionProvider';
import { Cargando } from '../components/Cargando';

interface Props {
  tipo: Sesion['usuario']['tipo'];
  // Las pantallas operativas del staff necesitan una sucursal de trabajo elegida.
  requiereSucursal?: boolean;
  // Sin el permiso (o sin ninguno de la lista), vuelve al inicio del panel
  // (la API igual lo rechazaría).
  permiso?: CodigoPermiso | CodigoPermiso[];
  children: ReactNode;
}

export function RutaProtegida({ tipo, requiereSucursal = false, permiso, children }: Props) {
  const { sesion, cargando, tienePermiso } = useSesion();
  const { pathname } = useLocation();

  if (cargando) return <Cargando />;
  // Después del login se vuelve a la página pedida (por ejemplo, el menú del QR).
  if (!sesion) return <Navigate to="/login" replace state={{ desde: pathname, tipo }} />;
  if (sesion.usuario.tipo !== tipo) return <Navigate to={rutaInicio(sesion)} replace />;
  if (requiereSucursal && !sesion.sucursalActiva) return <Navigate to="/sucursal" replace />;
  const requeridos = permiso === undefined ? [] : [permiso].flat();
  if (requeridos.length > 0 && !requeridos.some(tienePermiso))
    return <Navigate to="/panel" replace />;
  return children;
}
