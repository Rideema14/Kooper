CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "price" DECIMAL(14,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierPrice_supplierId_ingredientId_key" ON "SupplierPrice"("supplierId", "ingredientId");
CREATE INDEX "SupplierPrice_restaurantId_ingredientId_idx" ON "SupplierPrice"("restaurantId", "ingredientId");
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
