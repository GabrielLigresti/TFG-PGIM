-- Beneficios con duración y relanzamiento (DER 3 v3) y comprobante numerado
-- por sucursal (DER 1 v2, menor del 28/10).

-- Programa de puntos permanente y grupos que solo agrupan
ALTER TABLE "programa_fidelidad" DROP COLUMN "activo";
ALTER TABLE "grupo_beneficios" DROP COLUMN "habilitado";

-- Stock inicial (se repone al relanzar) y vigencia obligatoria
ALTER TABLE "beneficio" ADD COLUMN "stock_inicial" INTEGER;
UPDATE "beneficio" SET "stock_inicial" = "stock_disponible";
UPDATE "beneficio"
SET "vigencia_desde" = COALESCE("vigencia_desde", now()),
    "vigencia_hasta" = COALESCE("vigencia_hasta", COALESCE("vigencia_desde", now()) + interval '30 days');
ALTER TABLE "beneficio"
  ALTER COLUMN "vigencia_desde" SET NOT NULL,
  ALTER COLUMN "vigencia_hasta" SET NOT NULL;

-- Restricciones que Prisma no expresa. Las de clase (menú o criterio) y
-- puntos >= 0 ya están desde la migración inicial; la de stock se reemplaza
-- por una que también acota el disponible al inicial.
ALTER TABLE "beneficio" DROP CONSTRAINT "beneficio_stock_disponible_check";
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_stock_check" CHECK (
  ("stock_inicial" IS NULL AND "stock_disponible" IS NULL)
  OR ("stock_inicial" IS NOT NULL AND "stock_disponible" IS NOT NULL
      AND "stock_inicial" > 0 AND "stock_disponible" BETWEEN 0 AND "stock_inicial")
);
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_vigencia_check" CHECK (
  "vigencia_hasta" > "vigencia_desde"
);
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_valor_check" CHECK (
  "valor" > 0 AND ("tipo_descuento" <> 'PORCENTAJE' OR "valor" <= 100)
);
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_criterio_valor_check" CHECK (
  "criterio_valor" IS NULL OR "criterio_valor" > 0
);

-- Comprobante numerado por sucursal
ALTER TABLE "comprobante" ADD COLUMN "sucursal_id" UUID;
UPDATE "comprobante" c
SET "sucursal_id" = r."sucursal_id"
FROM "pago" p
JOIN "cuenta_mesa" cm ON cm."id" = p."cuenta_mesa_id"
JOIN "reserva" r ON r."id" = cm."reserva_id"
WHERE p."id" = c."pago_id";
ALTER TABLE "comprobante" ALTER COLUMN "sucursal_id" SET NOT NULL;
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "comprobante_numero_key";
CREATE UNIQUE INDEX "comprobante_sucursal_id_numero_key" ON "comprobante"("sucursal_id", "numero");

-- Aclaraciones por categoría (DER 2 v1, menor del 28/10)
ALTER TABLE "categoria" ADD COLUMN "admite_observaciones" BOOLEAN NOT NULL DEFAULT true;
