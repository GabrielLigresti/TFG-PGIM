import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search, SearchX } from 'lucide-react';
import { nombreBarrio, type BarrioConSucursales, type ResultadoBusqueda } from '@pgim/shared';
import { useRecurso } from '../lib/useRecurso';
import { Aviso, Boton, EstadoCarga, Vacio, claseInput } from './ui';

const ESPERA_BUSQUEDA_MS = 300;

// Buscador de la landing: texto libre y barrio. El resultado se actualiza solo,
// poco después de que el visitante deja de escribir.
export function BuscadorSucursales() {
  const [texto, setTexto] = useState('');
  // '' = todos los barrios.
  const [barrio, setBarrio] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const espera = setTimeout(() => setQ(texto.trim()), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (barrio) params.set('barrio', barrio);
  const consulta = params.toString();

  const barrios = useRecurso<BarrioConSucursales[]>('/publico/barrios').datos;
  const { datos, cargando, error, recargar } = useRecurso<ResultadoBusqueda[]>(
    `/publico/buscar${consulta ? `?${consulta}` : ''}`,
  );

  function limpiar() {
    setTexto('');
    setQ('');
    setBarrio('');
  }

  const resumen =
    datos && datos.length > 0
      ? `${datos.length === 1 ? '1 sucursal' : `${datos.length} sucursales`}${
          barrio ? ` en ${nombreBarrio(barrio as BarrioConSucursales['valor'])}` : ''
        }`
      : '';

  return (
    <>
      <section className="rounded-panel bg-hoja p-4 md:p-6">
        <h1 className="font-display text-[26px] leading-[30px] font-semibold text-ink">
          ¿Dónde comemos hoy?
        </h1>
        <p className="mt-1 text-[15px] text-text">
          Buscá un restaurante, un barrio o un plato, mirá la carta y reservá tu mesa.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-meta"
            />
            <input
              type="search"
              aria-label="Buscar"
              placeholder="Restaurante, plato o dirección"
              value={texto}
              maxLength={100}
              onChange={(e) => setTexto(e.target.value)}
              className={`${claseInput} min-h-11 pl-10 sm:min-h-11 sm:text-[16px]`}
            />
          </div>
          <select
            aria-label="Barrio"
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            className={`${claseInput} min-h-11 sm:min-h-11 sm:text-[16px]`}
          >
            <option value="">Todos los barrios</option>
            {barrios?.map((b) => (
              <option key={b.valor} value={b.valor}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="mt-5">
        {error ? (
          <div className="grid justify-items-start gap-3">
            <Aviso tono="bad">No pudimos cargar las sucursales.</Aviso>
            <Boton variante="secundario" densidad="comensal" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        ) : (
          <>
            <EstadoCarga cargando={cargando && !datos} error={null} />
            <p aria-live="polite" className="mb-3 text-sm text-meta">
              {resumen}
            </p>
            {datos?.length === 0 && (
              <Vacio
                icono={SearchX}
                titulo="No encontramos sucursales con esa búsqueda"
                texto="Probá con otro plato o elegí Todos los barrios."
                accion={
                  <Boton variante="secundario" densidad="comensal" onClick={limpiar}>
                    Limpiar búsqueda
                  </Boton>
                }
              />
            )}
            {datos && datos.length > 0 && (
              <ul className="grid gap-3 md:grid-cols-2">
                {datos.map((r) => (
                  <TarjetaResultado key={r.sucursal.id} r={r} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TarjetaResultado({ r }: { r: ResultadoBusqueda }) {
  const { sucursal, restaurante, platosCoincidentes } = r;
  return (
    <li className="flex flex-col gap-1 rounded-panel border border-line bg-surface p-4">
      <p className="font-semibold text-ink">{restaurante.nombre}</p>
      <p className="text-sm text-text">
        {sucursal.nombre} · {nombreBarrio(sucursal.barrio)}
      </p>
      <p className="text-sm text-meta">{sucursal.direccion}</p>
      {platosCoincidentes.length > 0 && (
        <p className="text-sm text-text">
          <span className="font-medium text-accent-ink">Coincide:</span>{' '}
          {platosCoincidentes.join(', ')}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Link
          to={`/s/${sucursal.id}/menu`}
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-panel"
        >
          Ver carta
        </Link>
        <Link
          to={`/s/${sucursal.id}/reservar`}
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent/20 bg-accent-soft px-4 text-sm font-semibold text-accent-ink hover:bg-accent/15"
        >
          Reservar
        </Link>
      </div>
    </li>
  );
}
