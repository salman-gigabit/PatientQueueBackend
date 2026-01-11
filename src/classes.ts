import { z } from "zod";

export enum Priority {
  Normal = "Normal",
  Emergency = "Emergency",
}

export enum Role {
  admin = "admin",
  user = "user",
}

const NAME_LEN = 3;
const PROBLEM_LEN = 3;
const PASSWORD_LEN = 6;

// Request/response schemas
export const patientInSchema = z.object({
  name: z
    .string()
    .min(NAME_LEN, `name must be at least ${NAME_LEN} characters`),
  problem: z
    .string()
    .min(PROBLEM_LEN, `problem must be at least ${PROBLEM_LEN} characters`),
  priority: z.nativeEnum(Priority).default(Priority.Normal),
});

export const patientSchema = patientInSchema.extend({
  id: z.number().int(),
  arrivalTime: z.string(),
  status: z.string(),
  priority: z.nativeEnum(Priority),
});

export const signupRequestSchema = z.object({
  name: z
    .string()
    .min(NAME_LEN, `name must be at least ${NAME_LEN} characters`),
  email: z.string().email("email must be a valid address"),
  password: z
    .string()
    .min(PASSWORD_LEN, `password must be at least ${PASSWORD_LEN} characters`),
});

export const loginRequestSchema = z.object({
  email: z.string().email("email must be a valid address"),
  password: z.string().min(1, "password is required"),
});

export const userResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

export const authResponseSchema = z.object({
  token: z.string(),
  user: userResponseSchema,
});

export const messageResponseSchema = z.object({
  message: z.string(),
});

// Inferred types
export type PatientIn = z.infer<typeof patientInSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;

// Safe-parse helpers for convenience
export const validatePatientIn = (input: unknown) =>
  patientInSchema.safeParse(input);

export const validateSignupRequest = (input: unknown) =>
  signupRequestSchema.safeParse(input);

export const validateLoginRequest = (input: unknown) =>
  loginRequestSchema.safeParse(input);
