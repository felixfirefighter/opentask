export const demoEmailSuffix = "@demo.opentask.invalid";

export function isDemoAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(demoEmailSuffix);
}
