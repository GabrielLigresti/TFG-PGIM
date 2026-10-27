#!/usr/bin/env bash
# Lista los colores de la paleta de Tailwind usados directamente en el front.
# Las pantallas usan los tokens del sistema visual (src/index.css).
# Uso: scripts/colores-sueltos.sh [rutas...]   (por defecto, apps/web/src)
set -u
rutas=("$@")
[ ${#rutas[@]} -eq 0 ] && rutas=(apps/web/src)
if grep -rnE '\b(slate|gray|emerald|amber|red|green|yellow|stone)-[0-9]{2,3}\b' \
  --include='*.tsx' --include='*.ts' "${rutas[@]}"; then
  exit 1
fi
echo "Sin colores sueltos."
