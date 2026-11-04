import { useState, type ReactNode } from 'react';
import { Boton } from '../../../components/ui';

// Alternativa accesible de cada gráfico: los mismos datos en una tabla.
export function VerComoTabla({
  grafico,
  tabla,
  resumen,
}: {
  grafico: ReactNode;
  tabla: ReactNode;
  resumen: string;
}) {
  const [tabular, setTabular] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Boton
          variante="fantasma"
          aria-pressed={tabular}
          onClick={() => setTabular((t) => !t)}
          className="!min-h-8 !px-2 text-xs"
        >
          {tabular ? 'Ver como gráfico' : 'Ver como tabla'}
        </Boton>
      </div>
      {tabular ? (
        tabla
      ) : (
        <div role="img" aria-label={resumen}>
          {grafico}
        </div>
      )}
    </div>
  );
}
