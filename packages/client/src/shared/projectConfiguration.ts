import { z } from "zod";

export const manualRelationshipSchema = z.object({
  constraintId: z.string().startsWith("manual:").max(2000),
  localSchema: z.string().min(1),
  localTable: z.string().min(1),
  foreignSchema: z.string().min(1),
  foreignTable: z.string().min(1),
  columnPairs: z
    .array(
      z.object({
        localColumn: z.string().min(1),
        foreignColumn: z.string().min(1),
      }),
    )
    .min(1)
    .max(32),
});

export const projectConfigurationSchema = z.object({
  inferRelationships: z
    .union([
      z.boolean(),
      z.object({
        crossSchema: z.boolean().optional(),
        pluralConversion: z.boolean().optional(),
        multipleCandidateBehaviour: z.enum(["skip", "error"]).optional(),
        identicalDataTypesOnly: z.boolean().optional(),
      }),
    ])
    .optional(),
  minimumRelationshipConfidence: z.number().min(0).max(1).optional(),
  excludedRelationships: z
    .array(z.string().min(1).max(2000))
    .max(10000)
    .optional(),
  relationships: z.array(manualRelationshipSchema).max(1000).optional(),
});

export type ProjectConfiguration = z.infer<typeof projectConfigurationSchema>;
