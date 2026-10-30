import { useSearchParams } from 'react-router';
import { useSesion } from '../../auth/SesionProvider';
import { EncabezadoPagina, Segmentado } from '../../components/ui';
import { ProduccionTab } from './stock/ProduccionTab';

type Pestaña = 'produccion';

// La pestaña activa vive en la URL para que "Volver" y la recarga la conserven.
const PESTAÑAS: { valor: Pestaña; texto: string }[] = [
  { valor: 'produccion', texto: 'Producción' },
];

export function StockPage() {
  const { sesion } = useSesion();
  const [params, setParams] = useSearchParams();
  const pedida = params.get('pestaña');
  const activa = PESTAÑAS.find((p) => p.valor === pedida)?.valor ?? PESTAÑAS[0]!.valor;

  return (
    <section>
      <EncabezadoPagina
        titulo="Stock"
        descripcion={sesion?.sucursalActiva?.nombre ?? 'Sucursal de trabajo'}
      />
      {PESTAÑAS.length > 1 && (
        <div className="mb-4">
          <Segmentado<Pestaña>
            etiqueta="Secciones de stock"
            valor={activa}
            onCambiar={(v) => setParams({ pestaña: v })}
            opciones={PESTAÑAS}
          />
        </div>
      )}
      {activa === 'produccion' && <ProduccionTab />}
    </section>
  );
}
