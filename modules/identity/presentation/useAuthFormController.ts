import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { fetchWithConnectivity, retryConnectivity, useConnectivityStatus } from "@/shared/presentation";

import {
  authEndpoint,
  authRequestBody,
  resolveSafeReturnTo,
  validateAuthFields,
  type AuthField,
  type AuthFieldErrors,
  type AuthFieldValues,
  type AuthMode,
} from "./auth-form-contract";

const initialValues: AuthFieldValues = { email: "", password: "", passwordConfirmation: "" };
type SubmissionStage = "idle" | "creating" | "signing-in";

export function useAuthFormController({
  mode,
  returnTo,
  navigate,
}: {
  mode: AuthMode;
  returnTo?: string | null | undefined;
  navigate(destination: string): void;
}) {
  const [values, setValues] = useState<AuthFieldValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>("idle");
  const ready = useSyncExternalStore(subscribeToHydration, readHydrated, readServerHydrated);
  const connectivity = useConnectivityStatus();
  const online = connectivity === "online";
  const submittingRef = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const submitting = submissionStage !== "idle";
  const hasErrors = Object.keys(fieldErrors).length > 0 || serverError !== null;

  useEffect(() => {
    if (hasErrors) errorSummaryRef.current?.focus();
  }, [hasErrors, fieldErrors, serverError]);

  function updateField(field: AuthField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setServerError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submittingRef.current || !online) return;

    const nextErrors = validateAuthFields(mode, values);
    setFieldErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    submittingRef.current = true;
    setSubmissionStage(mode === "sign-in" ? "signing-in" : "creating");
    try {
      const credentials = authRequestBody(values);
      if (!(await postCredentials(authEndpoint(mode), credentials)).ok) {
        setServerError(genericServerError(mode));
        return;
      }
      if (mode === "sign-up") {
        setSubmissionStage("signing-in");
        if (!(await postCredentials(authEndpoint("sign-in"), credentials)).ok) {
          setServerError(genericServerError(mode));
          return;
        }
      }
      navigate(resolveSafeReturnTo(returnTo));
    } catch {
      // fetchWithConnectivity owns transport failure reporting. Credential-safe copy is reserved
      // for an HTTP response so an unreachable server is never misreported as bad credentials.
    } finally {
      submittingRef.current = false;
      setSubmissionStage("idle");
    }
  }

  return {
    connectivity,
    errorSummaryRef,
    fieldErrors,
    hasErrors,
    online,
    ready,
    retryConnection: retryConnectivity,
    serverError,
    submissionLabel: submitLabel(mode, submissionStage),
    submit,
    submitting,
    updateField,
    values,
  };
}

function genericServerError(mode: AuthMode) {
  return mode === "sign-in"
    ? "We couldn’t sign you in with those details. Check them and try again."
    : "We couldn’t create your account. Check the form and try again.";
}

function submitLabel(mode: AuthMode, stage: SubmissionStage) {
  if (stage === "signing-in") return "Signing in…";
  if (stage === "creating") return "Creating account…";
  return mode === "sign-in" ? "Sign in" : "Create account";
}

function postCredentials(endpoint: string, credentials: { email: string; password: string }) {
  return fetchWithConnectivity(endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
}

function subscribeToHydration() {
  // React rechecks the client snapshot after hydrating the disabled server markup.
  return () => undefined;
}

function readHydrated() {
  return true;
}

function readServerHydrated() {
  return false;
}
