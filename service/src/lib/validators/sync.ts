import { z } from "zod";

export const syncChangeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.any()).optional(),
  updatedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "updatedAt must be an ISO date string",
    }),
});

export const pushSyncSchema = z.object({
  cursor: z.number().int().nonnegative().optional(),
  changes: z.array(syncChangeSchema).default([]),
  summary: z.string().optional(),
});

export const pullSyncQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("cursor must be a non-negative number");
      }

      return parsed;
    }),
});

export type SyncChangeInput = z.infer<typeof syncChangeSchema>;
export type PushSyncInput = z.infer<typeof pushSyncSchema>;
