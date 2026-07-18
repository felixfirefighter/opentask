export type AuthenticatedActor = Readonly<{
  userId: string;
}>;

export type SessionIdentity = Readonly<{
  actor: AuthenticatedActor;
  displayName: string;
  email: string;
}>;

export class AuthenticationRequiredError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("A valid session is required.");
    this.name = "AuthenticationRequiredError";
  }
}
