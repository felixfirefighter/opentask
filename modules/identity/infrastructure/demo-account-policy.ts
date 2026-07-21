export const demoEmailSuffix = "@demo.omplish.invalid";

export function isDemoAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(demoEmailSuffix);
}
