-- Intermedios con stock opcional y producción por tandas (DER 2 v2, CU-22).

-- CreateEnum
CREATE TYPE "motivo_merma" AS ENUM ('VENCIMIENTO', 'DETERIORO', 'PREPARACION', 'SOBREPRODUCCION', 'ERROR', 'DEVUELTO_POR_CLIENTE', 'RECEPCION', 'OTRO');

-- AlterEnum
ALTER TYPE "tipo_movimiento" ADD VALUE 'PRODUCCION';
ALTER TYPE "tipo_movimiento" ADD VALUE 'CONSUMO_PRODUCCION';

-- AlterTable: se renombra (no se borra) para conservar los costos cargados.
ALTER TABLE "componente_inventario" RENAME COLUMN "costo_compra" TO "costo_compra_vigente";
ALTER TABLE "componente_inventario" ADD COLUMN "lleva_stock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "movimiento_stock" ADD COLUMN     "cantidad_teorica" DECIMAL(14,3),
ADD COLUMN     "motivo_merma" "motivo_merma",
ADD COLUMN     "tanda_id" UUID;

-- CreateTable
CREATE TABLE "tanda_produccion" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "intermedio_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "cantidad_esperada" DECIMAL(14,3) NOT NULL,
    "cantidad_obtenida" DECIMAL(14,3) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,

    CONSTRAINT "tanda_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tanda_produccion_sucursal_id_fecha_idx" ON "tanda_produccion"("sucursal_id", "fecha");

-- CreateIndex
CREATE INDEX "tanda_produccion_intermedio_id_fecha_idx" ON "tanda_produccion"("intermedio_id", "fecha");

-- CreateIndex
CREATE INDEX "tanda_produccion_empleado_id_idx" ON "tanda_produccion"("empleado_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_tanda_id_idx" ON "movimiento_stock"("tanda_id");

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_tanda_id_fkey" FOREIGN KEY ("tanda_id") REFERENCES "tanda_produccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanda_produccion" ADD CONSTRAINT "tanda_produccion_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanda_produccion" ADD CONSTRAINT "tanda_produccion_intermedio_id_fkey" FOREIGN KEY ("intermedio_id") REFERENCES "componente_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanda_produccion" ADD CONSTRAINT "tanda_produccion_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las mermas existentes (si hubiera) quedan con motivo OTRO antes del CHECK.
UPDATE "movimiento_stock" SET "motivo_merma" = 'OTRO' WHERE "tipo" = 'MERMA' AND "motivo_merma" IS NULL;

-- CHECK (ver der/convenciones.md). Los valores nuevos de tipo_movimiento no se
-- pueden usar como literal del enum en la misma transacción: se compara como texto.
ALTER TABLE "componente_inventario" ADD CONSTRAINT "componente_lleva_stock_ck"
  CHECK (NOT "lleva_stock" OR "tipo" = 'INTERMEDIO');

ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_motivo_merma_ck"
  CHECK (("tipo"::text = 'MERMA') = ("motivo_merma" IS NOT NULL));

ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_tanda_ck"
  CHECK (("tipo"::text IN ('PRODUCCION', 'CONSUMO_PRODUCCION')) = ("tanda_id" IS NOT NULL));

ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_cantidad_teorica_ck"
  CHECK (("tipo"::text = 'CONSUMO_PRODUCCION') = ("cantidad_teorica" IS NOT NULL));

ALTER TABLE "tanda_produccion" ADD CONSTRAINT "tanda_cantidades_ck"
  CHECK ("cantidad_esperada" > 0 AND "cantidad_obtenida" > 0);
