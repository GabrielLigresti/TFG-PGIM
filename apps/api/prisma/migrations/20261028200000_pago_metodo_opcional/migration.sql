-- El comensal elige el medio en Mercado Pago: se conoce al aprobarse el pago
-- (DER 1 v2, menor del 28/10).
ALTER TABLE "pago" ALTER COLUMN "metodo" DROP NOT NULL;
