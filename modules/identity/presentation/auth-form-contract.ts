import { z } from "zod";

export type AuthMode = "sign-in" | "sign-up";
export type AuthField = "email" | "password" | "passwordConfirmation";
export type AuthFieldValues = Readonly<Record<AuthField, string>>;
export type AuthFieldErrors = Partial<Record<AuthField, string>>;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Email address must be 254 characters or fewer.")
  .email("Enter a valid email address.");

const passwordSchema = z
  .string()
  .min(1, "Enter your password.")
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.");

const signInSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

const signUpSchema = z
  .strictObject({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, "Confirm your password."),
  })
  .superRefine((values, context) => {
    if (values.passwordConfirmation && values.password !== values.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        message: "Passwords must match.",
        path: ["passwordConfirmation"],
      });
    }
  });

export function validateAuthFields(mode: AuthMode, values: AuthFieldValues): AuthFieldErrors {
  const result =
    mode === "sign-in"
      ? signInSchema.safeParse({ email: values.email, password: values.password })
      : signUpSchema.safeParse(values);

  if (result.success) return {};

  const errors: AuthFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (isAuthField(field) && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

export function authEndpoint(mode: AuthMode) {
  return mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
}

export function authRequestBody(values: AuthFieldValues) {
  return { email: values.email.trim(), password: values.password };
}

export function resolveSafeReturnTo(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/inbox";
  if (returnTo.includes("\\") || /[\u0000-\u001f\u007f]/u.test(returnTo)) return "/inbox";

  try {
    const base = new URL("https://opentask.invalid");
    const target = new URL(returnTo, base);
    if (target.origin !== base.origin) return "/inbox";
    if (target.pathname === "/sign-in" || target.pathname === "/sign-up") return "/inbox";
    if (target.pathname === "/api" || target.pathname.startsWith("/api/")) return "/inbox";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/inbox";
  }
}

export function alternateAuthHref(mode: AuthMode, returnTo?: string | null): string {
  const pathname = mode === "sign-in" ? "/sign-up" : "/sign-in";
  if (!returnTo) return pathname;

  const safeReturnTo = resolveSafeReturnTo(returnTo);
  if (safeReturnTo === "/inbox" && returnTo !== "/inbox") return pathname;
  return `${pathname}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

function isAuthField(value: PropertyKey | undefined): value is AuthField {
  return value === "email" || value === "password" || value === "passwordConfirmation";
}
