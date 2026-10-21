import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Sesion } from '@pgim/shared';
import { rutaInicio, useSesion } from './SesionProvider';
import { Cargando } from '../components/Cargando';

interface Props {
  tipo: Sesion['usuario']['tipo'];
  // Las pantallas operativas del staff necesitan una sucursal de trabajo elegida.
  requiereSucursal?: boolean;
  children: ReactNode;
}

export function RutaProtegida({ tipo, requiereSucursal = false, children }: Props) {
  const { sesion, cargando } = useSesion();

  if (cargando) return <Cargando />;
  if (!sesion) return <Navigate to="/login" replace />;
  if (sesion.usuario.tipo !== tipo) return <Navigate to={rutaInicio(sesion)} replace />;
  if (requiereSucursal && !sesion.sucursalActiva) return <Navigate to="/sucursal" replace />;
  return children;
}
