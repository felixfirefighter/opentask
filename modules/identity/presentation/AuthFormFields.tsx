import { useState, type Ref } from "react";

import styles from "./AuthScreen.module.css";
import type { AuthField, AuthFieldErrors } from "./auth-form-contract";

const fieldLabels: Record<AuthField, string> = {
  email: "Email",
  password: "Password",
  passwordConfirmation: "Confirm password",
};

export function EmailAuthField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor="auth-email">Email</label>
      <input
        id="auth-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck="false"
        placeholder="you@example.com"
        required
        maxLength={254}
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? "auth-email-error" : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error && <FieldError id="auth-email-error">{error}</FieldError>}
    </div>
  );
}

export function PasswordAuthField({
  id,
  label,
  value,
  autoComplete,
  error,
  guidance,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  error?: string | undefined;
  guidance?: string | undefined;
  onChange(value: string): void;
}) {
  const [revealed, setRevealed] = useState(false);
  const errorId = `${id}-error`;
  const guidanceId = `${id}-guidance`;
  const describedBy = [guidance ? guidanceId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <span className={styles.passwordControl}>
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={128}
          required
          value={value}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          className={styles.revealButton}
          type="button"
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </span>
      {guidance && (
        <span className={styles.guidance} id={guidanceId}>
          {guidance}
        </span>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function AuthErrorSummary({
  summaryRef,
  errors,
  serverError,
}: {
  summaryRef: Ref<HTMLDivElement>;
  errors: AuthFieldErrors;
  serverError: string | null;
}) {
  const entries = (Object.keys(fieldLabels) as AuthField[]).filter((field) => errors[field]);

  return (
    <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={summaryRef}>
      <strong>{serverError ?? "Check the fields below."}</strong>
      {entries.length > 0 && (
        <ul>
          {entries.map((field) => (
            <li key={field}>
              <a
                href={`#${fieldId(field)}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(fieldId(field))?.focus();
                }}
              >
                {fieldLabels[field]}: {errors[field]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span className={styles.fieldError} id={id}>
      {children}
    </span>
  );
}

function fieldId(field: AuthField) {
  return field === "passwordConfirmation" ? "auth-password-confirmation" : `auth-${field}`;
}
