-- AlterTable
ALTER TABLE "item_menu" ADD COLUMN     "insumo_id" UUID;

-- CreateIndex
CREATE INDEX "item_menu_insumo_id_idx" ON "item_menu"("insumo_id");

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "componente_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
