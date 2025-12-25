import type { MyZRecord } from "@/shared/types.ts";
import { normalizeRecord } from "./records";
import { z } from "zod";

const ImportStructureSchema = z.union([
  z.array(z.unknown()),
  z.object({ highlights: z.array(z.unknown()) }).transform((data) => data.highlights),
  z.object({ data: z.array(z.unknown()) }).transform((data) => data.data),
]);

export function normalizeImportedPayload(
  payload: MyZRecord[] | { highlights?: MyZRecord[]; data?: MyZRecord[] } | any,
): MyZRecord[] {
  const result = ImportStructureSchema.safeParse(payload);

  if (!result.success) {
    return [];
  }

  const rawItems = result.data;

  return rawItems
    .map((item) => normalizeRecord(item))
    .filter((item): item is MyZRecord => item !== null);
}
