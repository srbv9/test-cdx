import { z } from 'zod';

export const registrationSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)
});

export const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
