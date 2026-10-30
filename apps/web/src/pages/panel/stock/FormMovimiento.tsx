import { useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  CONVERSION,
  ETIQUETA_MOTIVO_MERMA,
  ETIQUETA_UNIDAD,
  MOTIVOS_MERMA,
  unidadesCompatibles,
  type ComponenteStock,
  type MotivoMerma,
  type MovimientoInput,
  type UnidadMedida,
} from '@pgim/shared';
import { Aviso, Boton, Campo, Modal, claseInput, propsDecimal } from '../../../components/ui';
import { aNumero, formatoCantidadLegible, formatoPesos } from '../../../lib/formato';
import { useGuardar } from '../../../lib/useGuardar';
import { formatoDiferencia } from './tanda';

export type TipoFormulario = 'INGRESO' | 'MERMA' | 'AJUSTE';

const TITULO: Record<TipoFormulario, string> = {
  INGRESO: 'Registrar ingreso',
  MERMA: 'Registrar merma',
  AJUSTE: 'Registrar ajuste',
};

// Arranca en kg o l, la unidad con la que se leen las cantidades.
const unidadInicial = (c: ComponenteStock): UnidadMedida => {
  const compatibles = unidadesCompatibles(c.unidadBase);
  return compatibles[compatibles.length - 1] ?? 'UNIDAD';
};

// Un diálogo por tipo de movimiento manual. Al registrar devuelve el aviso para la lista.
export function FormMovimiento({
  tipo,
  componente,
  onCerrar,
  onRegistrado,
}: {
  tipo: TipoFormulario;
  componente: ComponenteStock;
  onCerrar(): void;
  onRegistrado(aviso: string): void;
}) {
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<UnidadMedida>(unidadInicial(componente));
  const [costo, setCosto] = useState('');
  const [motivoMerma, setMotivoMerma] = useState<MotivoMerma | ''>('');
  const [observacion, setObservacion] = useState('');
  const [motivo, setMotivo] = useState('');
  const { enviar, enviando, error } = useGuardar();

  const unidades = unidadesCompatibles(componente.unidadBase);
  const factor = CONVERSION[unidad].factor;
  const etiquetaUnidad = ETIQUETA_UNIDAD[unidad];
  const contada = aNumero(cantidad);
  const diferencia = Number.isNaN(contada) ? null : contada * factor - componente.existencia;
  const textoDiferencia =
    diferencia === null ? '' : formatoDiferencia(diferencia, componente.unidadBase);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const base = { componenteId: componente.id, unidad };
    const nota = observacion.trim() ? { observacion: observacion.trim() } : {};
    // Un campo vacío viaja como NaN y la API responde con su mensaje.
    const cuerpo: MovimientoInput =
      tipo === 'INGRESO'
        ? { ...base, tipo, cantidad: aNumero(cantidad), costoUnitario: aNumero(costo), ...nota }
        : tipo === 'MERMA'
          ? {
              ...base,
              tipo,
              cantidad: aNumero(cantidad),
              motivoMerma: motivoMerma as MotivoMerma,
              ...nota,
            }
          : { ...base, tipo, cantidadContada: aNumero(cantidad), motivo: motivo.trim() };
    const r = await enviar<{ existencia: number }>('/stock/movimientos', 'POST', cuerpo);
    if (!r) return;
    const queda = formatoCantidadLegible(r.datos.existencia, componente.unidadBase);
    const nombre = componente.nombre;
    onRegistrado(
      tipo === 'MERMA'
        ? `Merma de ${nombre} registrada. Quedan ${queda}`
        : tipo === 'INGRESO'
          ? `Ingreso de ${nombre} registrado. Ahora hay ${queda}`
          : `Ajuste de ${nombre} registrado. Ahora hay ${queda}`,
    );
  }

  const ultimoCosto =
    componente.costoCompraVigente === null
      ? ''
      : `Último costo: ${formatoPesos(componente.costoCompraVigente * factor)} por ${etiquetaUnidad}. `;

  return (
    <Modal titulo={`${TITULO[tipo]} · ${componente.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-3">
        {tipo === 'AJUSTE' && (
          <p className="text-sm text-meta">
            Hay registrado{' '}
            <span className="font-medium tabular-nums text-text">
              {formatoCantidadLegible(componente.existencia, componente.unidadBase)}
            </span>
          </p>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Campo etiqueta={tipo === 'AJUSTE' ? 'Cantidad contada' : 'Cantidad'}>
            <input
              {...propsDecimal}
              required
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Unidad">
            <select
              value={unidad}
              onChange={(e) => setUnidad(e.target.value as UnidadMedida)}
              className={claseInput}
            >
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {ETIQUETA_UNIDAD[u]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {tipo === 'AJUSTE' && diferencia !== null && (
          <p
            className={`flex items-center gap-1.5 text-sm font-medium tabular-nums ${
              diferencia < 0 && textoDiferencia !== '' ? 'text-bad' : 'text-text'
            }`}
          >
            {diferencia < 0 && textoDiferencia !== '' && (
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
            )}
            {textoDiferencia === ''
              ? 'Sin diferencia con lo registrado'
              : `Diferencia: ${textoDiferencia}`}
          </p>
        )}

        {tipo === 'INGRESO' && (
          <Campo
            etiqueta={`Costo por ${etiquetaUnidad}`}
            ayuda={`${ultimoCosto}Precio de contado, sin IVA si el restaurante es Responsable Inscripto; con IVA si es monotributista.`}
          >
            <input
              {...propsDecimal}
              required
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              className={claseInput}
            />
          </Campo>
        )}

        {tipo === 'MERMA' && (
          <Campo etiqueta="Motivo">
            <select
              required
              value={motivoMerma}
              onChange={(e) => setMotivoMerma(e.target.value as MotivoMerma | '')}
              className={claseInput}
            >
              <option value="">Elegí el motivo</option>
              {MOTIVOS_MERMA.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO_MERMA[m]}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {tipo === 'AJUSTE' ? (
          <Campo etiqueta="Motivo" ayuda="Por ejemplo, conteo de cierre">
            <input
              required
              maxLength={200}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={claseInput}
            />
          </Campo>
        ) : (
          <Campo etiqueta="Observación (opcional)">
            <input
              maxLength={200}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className={claseInput}
            />
          </Campo>
        )}

        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : TITULO[tipo]}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
