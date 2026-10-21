import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { CodigoPermiso, Sesion } from '@pgim/shared';
import { rutaInicio, useSesion } from './SesionProvider';
import { Cargando } from '../components/Cargando';

interface Props {
  tipo: Sesion['usuario']['tipo'];
  // Las pantallas operativas del staff necesitan una sucursal de trabajo elegida.
  requiereSucursal?: boolean;
  // Sin el permiso, vuelve al inicio del panel (la API igual lo rechazaría).
  permiso?: CodigoPermiso;
  children: ReactNode;
}

export function RutaProtegida({ tipo, requiereSucursal = false, permiso, children }: Props) {
  const { sesion, cargando, tienePermiso } = useSesion();

  if (cargando) return <Cargando />;
  if (!sesion) return <Navigate to="/login" replace />;
  if (sesion.usuario.tipo !== tipo) return <Navigate to={rutaInicio(sesion)} replace />;
  if (requiereSucursal && !sesion.sucursalActiva) return <Navigate to="/sucursal" replace />;
  if (permiso && !tienePermiso(permiso)) return <Navigate to="/panel" replace />;
  return children;
}
