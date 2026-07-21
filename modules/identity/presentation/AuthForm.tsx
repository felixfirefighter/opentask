"use client";

import { Button } from "@/shared/presentation";

import { AuthErrorSummary, EmailAuthField, PasswordAuthField } from "./AuthFormFields";
import styles from "./AuthScreen.module.css";
import type { AuthMode } from "./auth-form-contract";
import { useAuthFormController } from "./useAuthFormController";

type Navigate = (destination: string) => void;
const defaultNavigate: Navigate = (destination) => window.location.assign(destination);

export function AuthForm({
  mode,
  returnTo,
  navigate = defaultNavigate,
}: {
  mode: AuthMode;
  returnTo?: string | null | undefined;
  navigate?: Navigate | undefined;
}) {
  const controller = useAuthFormController({ mode, returnTo, navigate });
  const liveStatus = !controller.ready
    ? "Form controls are loading."
    : controller.submitting
      ? controller.submissionLabel
      : "";

  return (
    <form className={styles.form} onSubmit={controller.submit} noValidate aria-busy={!controller.ready}>
      <p className={styles.formNote}>All fields are required.</p>

      {controller.hasErrors && (
        <AuthErrorSummary
          summaryRef={controller.errorSummaryRef}
          errors={controller.fieldErrors}
          serverError={controller.serverError}
        />
      )}

      {controller.connectivity !== "online" && (
        <div className={styles.connectivityMessage}>
          <p role="status" aria-live="polite">
            {connectivityMessage(controller.connectivity, mode)}
          </p>
          {controller.connectivity === "network-unreachable" || controller.connectivity === "recovering" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={controller.connectivity === "recovering"}
              onClick={() => void controller.retryConnection()}
            >
              {controller.connectivity === "recovering" ? "Checking…" : "Try connection"}
            </Button>
          ) : null}
        </div>
      )}

      <fieldset className={styles.fieldset} disabled={!controller.ready || controller.submitting}>
        <EmailAuthField
          value={controller.values.email}
          error={controller.fieldErrors.email}
          onChange={(value) => controller.updateField("email", value)}
        />

        <PasswordAuthField
          id="auth-password"
          label="Password"
          value={controller.values.password}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          error={controller.fieldErrors.password}
          guidance="Use 8–128 characters."
          onChange={(value) => controller.updateField("password", value)}
        />

        {mode === "sign-up" && (
          <PasswordAuthField
            id="auth-password-confirmation"
            label="Confirm password"
            value={controller.values.passwordConfirmation}
            autoComplete="new-password"
            error={controller.fieldErrors.passwordConfirmation}
            onChange={(value) => controller.updateField("passwordConfirmation", value)}
          />
        )}

        <Button
          className={styles.submitButton}
          type="submit"
          disabled={!controller.ready || controller.submitting || !controller.online}
        >
          {controller.submissionLabel}
        </Button>
      </fieldset>

      <span className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </span>
    </form>
  );
}

function connectivityMessage(
  connectivity: "browser-offline" | "network-unreachable" | "recovering",
  mode: AuthMode,
) {
  const action = mode === "sign-in" ? "sign in" : "create an account";
  if (connectivity === "browser-offline") {
    return `You’re offline. Connect to the internet to ${action}.`;
  }
  if (connectivity === "recovering") {
    return `Checking the connection. You can ${action} when OpenTask responds.`;
  }
  return "OpenTask can’t reach the server. Check the connection and try again.";
}
