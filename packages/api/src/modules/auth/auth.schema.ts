import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const MagicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const MagicLinkVerifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const UpdateProfileSchema = z.object({
  display_name: z.string().max(128).transform(v => v.replace(/<[^>]*>/g, '')).optional(),
  bio: z.string().max(2000).transform(v => v.replace(/<[^>]*>/g, '')).optional(),
  avatar_url: z.union([z.string().url('Invalid URL'), z.literal('')]).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type MagicLinkInput = z.infer<typeof MagicLinkSchema>;
export type MagicLinkVerifyInput = z.infer<typeof MagicLinkVerifySchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
