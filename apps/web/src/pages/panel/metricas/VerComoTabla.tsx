import { useState, type ReactNode } from 'react';
import { Boton } from '../../../components/ui';

// Alternativa accesible de cada gráfico: los mismos datos en una tabla. El
// botón va en la acción del Panel, así que el estado se levanta a quien lo
// arma: `boton` para la cabecera y `tabular` para `VerComoTabla`.
export function useVerComoTabla() {
  const [tabular, setTabular] = useState(false);
  const boton = (
    <Boton
      variante="fantasma"
      aria-pressed={tabular}
      onClick={() => setTabular((t) => !t)}
      className="!min-h-8 !px-2 text-xs"
    >
      {tabular ? 'Ver como gráfico' : 'Ver como tabla'}
    </Boton>
  );
  return { tabular, boton };
}

export function VerComoTabla({
  tabular,
  grafico,
  tabla,
  resumen,
}: {
  tabular: boolean;
  grafico: ReactNode;
  tabla: ReactNode;
  resumen: string;
}) {
  return tabular ? (
    tabla
  ) : (
    <div role="img" aria-label={resumen}>
      {grafico}
    </div>
  );
}
