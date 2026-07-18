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

      {!controller.online && (
        <p className={styles.offlineMessage} role="status">
          You’re offline. Connect to the internet to {mode === "sign-in" ? "sign in" : "create an account"}.
        </p>
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
