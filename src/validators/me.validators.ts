import { z } from "zod";
import { optionalNullableUrl } from "./common.validators";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  photoURL: optionalNullableUrl
});
