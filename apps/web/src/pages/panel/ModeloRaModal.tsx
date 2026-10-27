import { useEffect, useState, type FormEvent } from 'react';
import { LIMITE_MODELO_MB, type ModeloRaInput, type Plato } from '@pgim/shared';
import { Aviso, Boton, Campo, Modal, claseInput, propsDecimal } from '../../components/ui';
import { ApiError, api, subirArchivo } from '../../lib/api';
import { aNumero, formatoCantidad } from '../../lib/formato';
import { useModelViewer } from '../../lib/useModelViewer';
import { useConfirmar } from '../../components/Confirmacion';

function verificarArchivo(archivo: File, extension: string): string | null {
  if (!archivo.name.toLowerCase().endsWith(extension)) return `Elegí un archivo ${extension}`;
  if (archivo.size > LIMITE_MODELO_MB * 1024 * 1024) {
    return `El archivo supera los ${LIMITE_MODELO_MB} MB`;
  }
  return null;
}

// CU-16, carga del modelo RA: el .glb es obligatorio (Android y web) y el .usdz
// opcional (iOS; si falta, model-viewer lo genera desde el .glb).
export function ModeloRaModal({
  plato,
  onCerrar,
  onGuardado,
}: {
  plato: Plato;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const actual = plato.modeloRa;
  const [glb, setGlb] = useState<File | null>(null);
  const [usdz, setUsdz] = useState<File | null>(null);
  const [escala, setEscala] = useState(String(actual?.escalaReal ?? 1));
  const [porcion, setPorcion] = useState(actual ? String(actual.porcionGramos) : '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = useModelViewer();

  // Vista previa del archivo elegido o, si no hay, del modelo guardado.
  const [urlLocal, setUrlLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!glb) return setUrlLocal(null);
    const url = URL.createObjectURL(glb);
    setUrlLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [glb]);
  const vistaPrevia = urlLocal ?? actual?.urlModelo;
  const escalaNumero = aNumero(escala);
  // Quick Look (iOS) usa el .usdz tal cual: con escala distinta de 1, uno subido
  // se vería con el tamaño del archivo. El generado desde el .glb sí la respeta.
  const usaUsdzSinEscala =
    Number.isFinite(escalaNumero) && escalaNumero !== 1 && Boolean(usdz ?? actual?.urlModeloIos);

  async function ejecutar(accion: () => Promise<unknown>) {
    setEnviando(true);
    setError(null);
    try {
      await accion();
      onGuardado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el modelo');
    } finally {
      setEnviando(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problema =
      (glb && verificarArchivo(glb, '.glb')) || (usdz && verificarArchivo(usdz, '.usdz'));
    if (problema) return setError(problema);
    if (!actual && !glb) return setError('Elegí el modelo .glb');

    const datos: ModeloRaInput = { escalaReal: escalaNumero, porcionGramos: aNumero(porcion) };
    const base = `/platos/${plato.id}/modelo-ra`;
    void ejecutar(async () => {
      if (glb) {
        const query = new URLSearchParams({
          escalaReal: String(datos.escalaReal),
          porcionGramos: String(datos.porcionGramos),
        });
        await subirArchivo(`${base}/glb?${query}`, glb);
      } else {
        await api(base, { method: 'PUT', body: datos });
      }
      if (usdz) await subirArchivo(`${base}/usdz`, usdz);
    });
  }

  const confirmar = useConfirmar();

  async function quitar() {
    if (
      !(await confirmar({
        mensaje: `¿Quitar el modelo RA de ${plato.nombre}?`,
        accion: 'Quitar modelo',
      }))
    )
      return;
    void ejecutar(() => api(`/platos/${plato.id}/modelo-ra`, { method: 'DELETE' }));
  }

  return (
    <Modal titulo={`Modelo RA: ${plato.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        {vistaPrevia && listo && Number.isFinite(escalaNumero) && escalaNumero > 0 && (
          // La clave remonta el visor al cambiar la escala: model-viewer 4.4
          // tira un error si se cambia en vivo.
          <model-viewer
            key={`${vistaPrevia}-${escalaNumero}`}
            src={vistaPrevia}
            alt={`Vista previa de ${plato.nombre}`}
            camera-controls
            touch-action="pan-y"
            scale={`${escalaNumero} ${escalaNumero} ${escalaNumero}`}
            style={{ width: '100%', height: '16rem', background: '#f8fafc', borderRadius: 12 }}
          />
        )}

        <Campo
          etiqueta={actual ? 'Reemplazar el modelo (.glb)' : 'Modelo (.glb)'}
          ayuda={`Con las texturas incluidas, hasta ${LIMITE_MODELO_MB} MB`}
        >
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            onChange={(e) => setGlb(e.target.files?.[0] ?? null)}
            className={claseInput}
          />
        </Campo>
        <Campo
          etiqueta="Modelo para iOS (.usdz)"
          ayuda={
            actual?.urlModeloIos
              ? 'Ya tiene uno; elegí otro para reemplazarlo. Tiene que estar a tamaño real'
              : 'Opcional: si falta, se genera desde el .glb. Tiene que estar a tamaño real'
          }
        >
          <input
            type="file"
            accept=".usdz,model/vnd.usdz+zip"
            onChange={(e) => setUsdz(e.target.files?.[0] ?? null)}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Escala real" ayuda="1 si el modelo ya está en metros">
            <input
              {...propsDecimal}
              required
              value={escala}
              onChange={(e) => setEscala(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Porción (g)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              required
              value={porcion}
              onChange={(e) => setPorcion(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        {usaUsdzSinEscala && (
          <p className="rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">
            iOS no aplica la escala a un .usdz subido: se verá con el tamaño del archivo. Subí un
            .usdz a tamaño real, o quitá el modelo y volvé a subir solo el .glb para que el de iOS
            se genere con la escala.
          </p>
        )}
        {actual && (
          <p className="text-sm text-meta">
            Guardado: escala {actual.escalaReal}, porción{' '}
            {formatoCantidad(actual.porcionGramos, 'GRAMO')}
            {actual.urlModeloIos ? ', con .usdz' : ''}.
          </p>
        )}

        <Aviso>{error}</Aviso>
        <div className="flex flex-wrap justify-between gap-2">
          {actual ? (
            <Boton variante="peligro" onClick={quitar} disabled={enviando}>
              Quitar modelo
            </Boton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
