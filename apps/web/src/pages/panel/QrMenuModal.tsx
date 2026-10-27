import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Sucursal } from '@pgim/shared';
import { Boton, Modal } from '../../components/ui';

// QR hacia el menú de la sucursal. Se arma con la URL desde la que se usa la
// app (con el quick tunnel cambia en cada arranque), así que se muestra en
// pantalla y no se imprime.
export function QrMenuModal({ sucursal, onCerrar }: { sucursal: Sucursal; onCerrar(): void }) {
  const url = `${window.location.origin}/s/${sucursal.id}/menu`;
  const [imagen, setImagen] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    void QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setImagen);
  }, [url]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      // Sin HTTPS (por ejemplo, por la red local) no hay portapapeles: queda el texto para copiar.
    }
  }

  return (
    <Modal titulo={`QR del menú: ${sucursal.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4 text-center">
        {imagen && (
          <img
            src={imagen}
            alt={`Código QR del menú de ${sucursal.nombre}`}
            className="mx-auto size-64"
          />
        )}
        {!sucursal.menuActivo && (
          <p className="rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">
            La sucursal no tiene menú activo: el comensal verá que no hay menú disponible.
          </p>
        )}
        <p className="break-all text-sm text-meta select-all">{url}</p>
        <Boton variante="secundario" onClick={copiar}>
          {copiado ? 'Enlace copiado' : 'Copiar enlace'}
        </Boton>
      </div>
    </Modal>
  );
}
