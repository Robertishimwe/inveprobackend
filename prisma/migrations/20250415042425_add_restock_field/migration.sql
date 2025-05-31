/*
  Warnings:

  - Added the required column `restock` to the `return_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
CREATE SEQUENCE IF NOT EXISTS "GlobalReturnNumberSeq" START 1;
ALTER TABLE "return_items" ADD COLUMN     "restock" BOOLEAN NOT NULL;
