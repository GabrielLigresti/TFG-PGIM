import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { EVENTOS_SOCKET } from '@pgim/shared';

// Una sola conexión por pestaña, creada recién cuando una pantalla la pide.
// Viaja por el mismo origen (proxy de Vite) y se autentica con la cookie.
let socket: Socket | null = null;

export function obtenerSocket(): Socket {
  socket ??= io({ withCredentials: true });
  return socket;
}

// Al cambiar la sesión (login, logout o sucursal de trabajo) el servidor la
// leyó en el handshake y dejó la conexión en las salas de antes: se reconecta
// el mismo socket para que tome la cookie nueva. Los oyentes de las pantallas
// siguen registrados y al reconectar vuelven a seguir su salón.
export function reconectarSocket(conSesion: boolean): void {
  if (!socket) return;
  socket.disconnect();
  if (conSesion) socket.connect();
}

// Escucha un evento mientras la pantalla está montada. Con salaSucursalId,
// además sigue el salón de esa sucursal (y lo vuelve a seguir al reconectar).
export function useEventoSocket<T>(
  evento: string,
  manejar: (datos: T) => void,
  salaSucursalId?: string,
): void {
  // manejar suele ser una función nueva en cada render: se guarda en un ref
  // para no suscribirse de nuevo cada vez.
  const manejador = useRef(manejar);
  useEffect(() => {
    manejador.current = manejar;
  });

  useEffect(() => {
    const conexion = obtenerSocket();
    const alRecibir = (datos: T) => manejador.current(datos);
    const seguir = () => {
      if (salaSucursalId) conexion.emit(EVENTOS_SOCKET.seguirSalon, salaSucursalId);
    };
    conexion.on(evento, alRecibir);
    conexion.on('connect', seguir);
    if (conexion.connected) seguir();
    return () => {
      conexion.off(evento, alRecibir);
      conexion.off('connect', seguir);
      if (salaSucursalId) conexion.emit(EVENTOS_SOCKET.dejarSalon, salaSucursalId);
    };
  }, [evento, salaSucursalId]);
}

export type EstadoConexion = 'en-vivo' | 'sin-conexion' | 'reintentando';

// Estado de la conexión en tiempo real, para el indicador "En vivo". Al volver
// la conexión llama a alReconectar (por ejemplo, para recargar la cola entera:
// lo que pasó mientras estaba cortada no llegó).
export function useConexionSocket(alReconectar?: () => void): EstadoConexion {
  const conexion = obtenerSocket();
  const [estado, setEstado] = useState<EstadoConexion>(
    conexion.connected ? 'en-vivo' : 'sin-conexion',
  );
  const reconectar = useRef(alReconectar);
  useEffect(() => {
    reconectar.current = alReconectar;
  });

  useEffect(() => {
    let estuvoCortada = false;
    const alConectar = () => {
      setEstado('en-vivo');
      if (estuvoCortada) reconectar.current?.();
      estuvoCortada = false;
    };
    const alCortarse = () => {
      estuvoCortada = true;
      setEstado('sin-conexion');
    };
    const alReintentar = () => setEstado('reintentando');
    conexion.on('connect', alConectar);
    conexion.on('disconnect', alCortarse);
    conexion.io.on('reconnect_attempt', alReintentar);
    return () => {
      conexion.off('connect', alConectar);
      conexion.off('disconnect', alCortarse);
      conexion.io.off('reconnect_attempt', alReintentar);
    };
  }, [conexion]);

  return estado;
}
