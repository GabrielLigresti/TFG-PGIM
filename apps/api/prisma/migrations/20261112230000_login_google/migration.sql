-- DropForeignKey
ALTER TABLE "credencial_biometrica" DROP CONSTRAINT "credencial_biometrica_usuario_id_fkey";

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- DropTable
DROP TABLE "credencial_biometrica";

-- CreateIndex
CREATE UNIQUE INDEX "usuario_google_id_key" ON "usuario"("google_id");

