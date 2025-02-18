-- CreateTable
CREATE TABLE "SoroswapPairs" (
    "tokenA" INTEGER NOT NULL,
    "tokenB" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT NOT NULL,
    "reserveA" INTEGER NOT NULL,
    "reserveB" INTEGER NOT NULL,

    CONSTRAINT "SoroswapPairs_pkey" PRIMARY KEY ("address")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoroswapPairs_address_key" ON "SoroswapPairs"("address");
