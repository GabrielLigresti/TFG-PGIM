import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSesion } from '../../auth/SesionProvider';
import { EncabezadoPagina, Segmentado } from '../../components/ui';
import { ExistenciasTab } from './stock/ExistenciasTab';
import { MovimientosTab } from './stock/MovimientosTab';
import { ProduccionTab } from './stock/ProduccionTab';

type Pestaña = 'existencias' | 'produccion' | 'movimientos';

// La pestaña activa vive en la URL para que "Volver" y la recarga la conserven.
const PESTAÑAS: { valor: Pestaña; texto: string }[] = [
  { valor: 'existencias', texto: 'Existencias' },
  { valor: 'produccion', texto: 'Producción' },
  { valor: 'movimientos', texto: 'Movimientos' },
];

export function StockPage() {
  const { sesion } = useSesion();
  const [params, setParams] = useSearchParams();
  // Las pestañas ponen su acción principal a la derecha de las secciones.
  const [acciones, setAcciones] = useState<HTMLDivElement | null>(null);
  const pedida = params.get('pestaña');
  const activa = PESTAÑAS.find((p) => p.valor === pedida)?.valor ?? PESTAÑAS[0]!.valor;

  return (
    <section>
      <EncabezadoPagina
        titulo="Stock"
        descripcion={sesion?.sucursalActiva?.nombre ?? 'Sucursal de trabajo'}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-sm:w-full max-sm:[&>div]:flex max-sm:[&>div]:w-full max-sm:[&_button]:flex-1">
          <Segmentado<Pestaña>
            etiqueta="Secciones de stock"
            valor={activa}
            onCambiar={(v) => setParams({ pestaña: v })}
            opciones={PESTAÑAS}
          />
        </div>
        <div ref={setAcciones} className="max-sm:w-full empty:hidden" />
      </div>
      {activa === 'existencias' && <ExistenciasTab accionesEncabezado={acciones} />}
      {activa === 'produccion' && <ProduccionTab accionesEncabezado={acciones} />}
      {activa === 'movimientos' && <MovimientosTab />}
    </section>
  );
}
