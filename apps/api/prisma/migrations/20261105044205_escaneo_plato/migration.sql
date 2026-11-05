-- CreateEnum
CREATE TYPE "EstadoEscaneo" AS ENUM ('PENDIENTE', 'PROCESANDO', 'EN_REVISION', 'PUBLICADO', 'DESCARTADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "escaneo_plato" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "item_menu_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "estado" "EstadoEscaneo" NOT NULL DEFAULT 'PENDIENTE',
    "proveedor" TEXT NOT NULL,
    "tarea_proveedor_id" TEXT,
    "ruta_video" TEXT,
    "url_modelo" TEXT,
    "url_modelo_ios" TEXT,
    "calidad" JSONB NOT NULL,
    "error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "escaneo_plato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escaneo_plato_restaurante_id_item_menu_id_idx" ON "escaneo_plato"("restaurante_id", "item_menu_id");

-- CreateIndex
CREATE INDEX "escaneo_plato_estado_idx" ON "escaneo_plato"("estado");

-- AddForeignKey
ALTER TABLE "escaneo_plato" ADD CONSTRAINT "escaneo_plato_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escaneo_plato" ADD CONSTRAINT "escaneo_plato_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escaneo_plato" ADD CONSTRAINT "escaneo_plato_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un solo escaneo activo (PENDIENTE, PROCESANDO o EN_REVISION) por plato.
CREATE UNIQUE INDEX "escaneo_plato_activo_por_plato"
  ON "escaneo_plato" ("item_menu_id")
  WHERE "estado" IN ('PENDIENTE', 'PROCESANDO', 'EN_REVISION');
