import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { BARRIOS, type Barrio } from '@pgim/shared';
import { ApiError } from '../lib/api';
import { rutaInicio, useSesion } from '../auth/SesionProvider';
import { Cargando } from '../components/Cargando';
import {
  HorariosServicioEditor,
  servicioAEnviar,
  servicioInicial,
} from '../components/HorariosServicioEditor';
import { Aviso, Boton, Campo, claseInput } from '../components/ui';
import { aNumero } from '../lib/formato';

type Errores = Record<string, string>;

// Los errores de validación llegan como lista de incidencias de zod, con la ruta del campo.
function erroresDeValidacion(detalles: unknown): Errores {
  const errores: Errores = {};
  if (!Array.isArray(detalles)) return errores;
  for (const d of detalles) {
    if (!d || typeof d !== 'object' || !('path' in d) || !('message' in d)) continue;
    if (!Array.isArray(d.path) || typeof d.message !== 'string') continue;
    // Los horarios de servicio se muestran juntos, sin importar qué franja falló.
    const ruta = d.path.map(String);
    const clave = ruta[1] === 'horariosServicio' ? 'sucursal.horariosServicio' : ruta.join('.');
    errores[clave] ??= d.message;
  }
  return errores;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-5">
      <h2 className="text-base font-semibold text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

// CU-11: alta de un restaurante con su primera sucursal y su administrador.
export function RegistroRestaurantePage() {
  const { sesion, cargando, registrarRestaurante } = useSesion();
  const navigate = useNavigate();
  const [restauranteNombre, setRestauranteNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [sucursalNombre, setSucursalNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [barrio, setBarrio] = useState<Barrio | ''>('');
  const [apertura, setApertura] = useState('12:00');
  const [cierre, setCierre] = useState('00:00');
  const [tolerancia, setTolerancia] = useState('15');
  const [servicio, setServicio] = useState(() => servicioInicial());
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campos = useRef<Record<string, HTMLInputElement | null>>({});

  if (cargando) return <Cargando />;
  if (sesion) return <Navigate to={rutaInicio(sesion)} replace />;

  const ref = (clave: string) => (el: HTMLInputElement | null) => {
    campos.current[clave] = el;
  };

  function marcar(nuevos: Errores, generico: string | null = null) {
    setErrores(nuevos);
    setError(generico);
    const primero = Object.keys(nuevos).find((c) => campos.current[c]);
    if (primero) campos.current[primero]?.focus();
  }

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrores({});
    setError(null);
    setEnviando(true);
    try {
      const nueva = await registrarRestaurante({
        restaurante: { nombre: restauranteNombre, cuit },
        sucursal: {
          nombre: sucursalNombre,
          direccion,
          barrio: barrio as Barrio,
          horarioApertura: apertura,
          horarioCierre: cierre,
          toleranciaNoShowMin: aNumero(tolerancia),
          horariosServicio: servicioAEnviar(servicio),
        },
        administrador: { nombreCompleto, email, password },
      });
      navigate(rutaInicio(nueva), { replace: true });
    } catch (e) {
      setEnviando(false);
      if (!(e instanceof ApiError)) return marcar({}, 'No se pudo registrar el restaurante');
      const campo = (e.detalles as { campo?: unknown } | undefined)?.campo;
      if (e.status === 409 && (campo === 'cuit' || campo === 'email')) {
        marcar({ [campo === 'cuit' ? 'restaurante.cuit' : 'administrador.email']: e.message });
      } else if (e.status === 400) {
        const porCampo = erroresDeValidacion(e.detalles);
        marcar(porCampo, Object.keys(porCampo).length ? null : e.message);
      } else {
        marcar({}, e.message);
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl space-y-5 rounded-panel border border-line bg-surface p-6"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-ink">Registrá tu restaurante</h1>
          <p className="text-sm text-meta">
            Creá el restaurante, su primera sucursal y tu cuenta de administrador.
          </p>
        </div>

        <Bloque titulo="Restaurante">
          <Campo etiqueta="Nombre" error={errores['restaurante.nombre']}>
            <input
              ref={ref('restaurante.nombre')}
              required
              maxLength={100}
              value={restauranteNombre}
              onChange={(e) => setRestauranteNombre(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo
            etiqueta="CUIT"
            ayuda="11 dígitos, con o sin guiones"
            error={errores['restaurante.cuit']}
          >
            <input
              ref={ref('restaurante.cuit')}
              required
              inputMode="numeric"
              autoComplete="off"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </Bloque>

        <Bloque titulo="Primera sucursal">
          <Campo etiqueta="Nombre" error={errores['sucursal.nombre']}>
            <input
              ref={ref('sucursal.nombre')}
              required
              maxLength={100}
              value={sucursalNombre}
              onChange={(e) => setSucursalNombre(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Dirección" error={errores['sucursal.direccion']}>
            <input
              ref={ref('sucursal.direccion')}
              required
              autoComplete="street-address"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Barrio" error={errores['sucursal.barrio']}>
            <select
              required
              value={barrio}
              onChange={(e) => setBarrio(e.target.value as Barrio)}
              className={claseInput}
            >
              <option value="" disabled>
                Elegí un barrio
              </option>
              {BARRIOS.map((b) => (
                <option key={b.valor} value={b.valor}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Apertura" error={errores['sucursal.horarioApertura']}>
              <input
                ref={ref('sucursal.horarioApertura')}
                type="time"
                required
                value={apertura}
                onChange={(e) => setApertura(e.target.value)}
                className={claseInput}
              />
            </Campo>
            <Campo
              etiqueta="Cierre"
              ayuda="00:00 es medianoche"
              error={errores['sucursal.horarioCierre']}
            >
              <input
                ref={ref('sucursal.horarioCierre')}
                type="time"
                required
                value={cierre}
                onChange={(e) => setCierre(e.target.value)}
                className={claseInput}
              />
            </Campo>
          </div>
          <Campo
            etiqueta="Tolerancia de llegada (minutos)"
            ayuda="Pasado ese tiempo sin que llegue el cliente, se puede marcar la inasistencia"
            error={errores['sucursal.toleranciaNoShowMin']}
          >
            <input
              ref={ref('sucursal.toleranciaNoShowMin')}
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              required
              value={tolerancia}
              onChange={(e) => setTolerancia(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <HorariosServicioEditor servicio={servicio} onChange={setServicio} />
          <Aviso>{errores['sucursal.horariosServicio']}</Aviso>
        </Bloque>

        <Bloque titulo="Tu cuenta">
          <Campo etiqueta="Nombre completo" error={errores['administrador.nombreCompleto']}>
            <input
              ref={ref('administrador.nombreCompleto')}
              autoComplete="name"
              required
              maxLength={120}
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Email" error={errores['administrador.email']}>
            <input
              ref={ref('administrador.email')}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo
            etiqueta="Contraseña"
            ayuda="Al menos 8 caracteres"
            error={errores['administrador.password']}
          >
            <input
              ref={ref('administrador.password')}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </Bloque>

        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <Boton type="submit" disabled={enviando} className="w-full">
          {enviando ? 'Creando el restaurante…' : 'Crear restaurante'}
        </Boton>

        <p className="text-center text-sm text-meta">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="font-medium text-accent-ink underline underline-offset-2">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
