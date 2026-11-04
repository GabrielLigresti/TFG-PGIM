-- Solo datos: las sucursales que ya existían quedan con la configuración de
-- apertura por defecto. Los valores repiten CONFIGURACION_APERTURA_POR_DEFECTO
-- de @pgim/shared (8 semanas, 20 cubiertos por mozo, 12 platos por cocinero y hora).
INSERT INTO "configuracion_apertura"
  ("sucursal_id", "semanas_historico_minimo", "cubiertos_por_mozo", "platos_por_cocinero_hora")
SELECT s."id", 8, 20, 12
FROM "sucursal" s
LEFT JOIN "configuracion_apertura" c ON c."sucursal_id" = s."id"
WHERE c."sucursal_id" IS NULL;
