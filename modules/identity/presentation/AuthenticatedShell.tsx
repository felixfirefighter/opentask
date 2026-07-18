import type { ReactNode } from "react";

import type { SessionIdentity } from "@/modules/identity";

import {
  AuthenticatedMobileNavigation,
  AuthenticatedNavigation,
  type AuthenticatedDestination,
} from "./AuthenticatedNavigation";
import styles from "./AuthenticatedShell.module.css";
import { OfflineBanner } from "./OfflineBanner";
import { type ThemePreference, ThemePreferenceSync } from "./theme-client";

export type AuthenticatedShellProps = Readonly<{
  identity: SessionIdentity;
  theme: ThemePreference;
  reducedMotion: boolean;
  currentDestination: AuthenticatedDestination;
  children: ReactNode;
}>;

export function AuthenticatedShell({
  children,
  currentDestination,
  identity,
  reducedMotion,
  theme,
}: AuthenticatedShellProps) {
  return (
    <div className={styles.shell}>
      <ThemePreferenceSync theme={theme} reducedMotion={reducedMotion} />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <AuthenticatedNavigation currentDestination={currentDestination} identity={identity} />
      <OfflineBanner />

      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      <AuthenticatedMobileNavigation currentDestination={currentDestination} />
    </div>
  );
}
