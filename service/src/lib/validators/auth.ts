import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a digit"),
  captchaId: z.string().uuid(),
  captchaAnswer: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  captchaId: z.string().uuid(),
  captchaAnswer: z.string().min(1),
});

export const oauthLoginSchema = z.object({
  provider: z.enum(["google", "github"]),
  accessToken: z.string().min(1),
  captchaId: z.string().uuid(),
  captchaAnswer: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
  email: z.string().email(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
