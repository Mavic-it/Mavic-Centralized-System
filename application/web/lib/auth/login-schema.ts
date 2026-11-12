import { z } from "zod";

export const loginCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your work email.")
    .email("Enter a valid email address.")
    .max(254),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(256, "Password is too long."),
});

export type LoginCredentials = z.infer<typeof loginCredentialsSchema>;
