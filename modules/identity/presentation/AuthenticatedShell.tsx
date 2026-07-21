import type { ReactNode } from "react";

import type { SessionIdentity } from "@/modules/identity";
import { WorkspaceRouteFreshness } from "@/shared/presentation";

import {
  AuthenticatedMobileNavigation,
  AuthenticatedNavigation,
  type AuthenticatedDestination,
} from "./AuthenticatedNavigation";
import styles from "./AuthenticatedShell.module.css";
import { OfflineBanner } from "./OfflineBanner";
import { PwaUpdateBanner } from "./PwaUpdateBanner";
import { RouteFocus } from "./RouteFocus";
import { type ThemePreference, ThemePreferenceSync } from "./theme-client";

export type AuthenticatedShellProps = Readonly<{
  identity: SessionIdentity;
  theme: ThemePreference;
  reducedMotion: boolean;
  currentDestination: AuthenticatedDestination;
  destinationTitle?: string | undefined;
  contextNavigation?: ReactNode;
  compactNavigation?: ReactNode;
  topBarActions?: ReactNode;
  mobileNavigation?: ReactNode;
  children: ReactNode;
}>;

export function AuthenticatedShell({
  children,
  compactNavigation,
  contextNavigation,
  currentDestination,
  destinationTitle,
  identity,
  mobileNavigation,
  reducedMotion,
  theme,
  topBarActions,
}: AuthenticatedShellProps) {
  const showMobileNavigation = mobileNavigation !== null;

  return (
    <div className={styles.shell} data-mobile-navigation={showMobileNavigation}>
      <ThemePreferenceSync theme={theme} reducedMotion={reducedMotion} />
      <WorkspaceRouteFreshness />
      <RouteFocus />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <AuthenticatedNavigation
        compactNavigation={compactNavigation}
        contextNavigation={contextNavigation}
        currentDestination={currentDestination}
        destinationTitle={destinationTitle}
        identity={identity}
        topBarActions={topBarActions}
      />
      <div className={styles.conditionStack}>
        <OfflineBanner />
        <PwaUpdateBanner />
      </div>

      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      {showMobileNavigation &&
        (mobileNavigation === undefined ? (
          <AuthenticatedMobileNavigation currentDestination={currentDestination} />
        ) : (
          mobileNavigation
        ))}
    </div>
  );
}
