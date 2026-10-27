#!/usr/bin/env bash
# Lista los colores usados directamente en el front, fuera de los tokens del
# sistema visual (src/index.css): paleta de Tailwind, bg-white y hex literales.
# Uso: scripts/colores-sueltos.sh [rutas...]   (por defecto, apps/web/src)
set -u
cd "$(dirname "$0")/.."
rutas=("$@")
[ ${#rutas[@]} -eq 0 ] && rutas=(apps/web/src)
for r in "${rutas[@]}"; do
  [ -e "$r" ] || { echo "No existe: $r" >&2; exit 2; }
done
patron='\b(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b|\bbg-white\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b'
grep -rnE "$patron" --include='*.tsx' --include='*.ts' "${rutas[@]}"
case $? in
  0) exit 1 ;;
  1) echo "Sin colores sueltos." ;;
  *) echo "No se pudo revisar." >&2; exit 2 ;;
esac
