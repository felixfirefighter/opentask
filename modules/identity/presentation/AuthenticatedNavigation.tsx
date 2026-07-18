import { Inbox, Settings } from "lucide-react";
import Link from "next/link";

import type { SessionIdentity } from "@/modules/identity";
import { BrandMark } from "@/shared/presentation";

import { AccountMenu } from "./AccountMenu";
import styles from "./AuthenticatedShell.module.css";

export type AuthenticatedDestination = "inbox" | "settings";

const destinationDetails = {
  inbox: { title: "Inbox", eyebrow: "Workspace", icon: Inbox, href: "/inbox" },
  settings: { title: "Settings", eyebrow: "Account", icon: Settings, href: "/settings" },
} as const;

export function AuthenticatedNavigation({
  currentDestination,
  identity,
}: {
  currentDestination: AuthenticatedDestination;
  identity: SessionIdentity;
}) {
  const current = destinationDetails[currentDestination];

  return (
    <>
      <nav className={styles.rail} aria-label="Primary navigation">
        <Link className={styles.railBrand} href="/inbox" aria-label="OpenTask inbox">
          <BrandMark compact />
        </Link>
        <div className={styles.railLinks}>
          <Link
            className={styles.railLink}
            href="/inbox"
            aria-label="Inbox"
            aria-current={currentDestination === "inbox" ? "page" : undefined}
            title="Inbox"
          >
            <Inbox size={19} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.railAccount}>
          <AccountMenu
            identity={identity}
            placement="rail"
            settingsCurrent={currentDestination === "settings"}
          />
        </div>
      </nav>

      <aside className={styles.contextSidebar} aria-label={`${current.title} navigation`}>
        <header className={styles.contextHeader}>
          <p>{current.eyebrow}</p>
          <strong>{current.title}</strong>
        </header>
        <nav className={styles.contextLinks} aria-label={`${current.title} destinations`}>
          <Link className={styles.contextLink} href={current.href} aria-current="page">
            <current.icon size={18} aria-hidden="true" />
            <span>{current.title}</span>
          </Link>
        </nav>
      </aside>

      <header className={styles.topBar}>
        <Link className={styles.topBarIdentity} href="/inbox" aria-label="OpenTask inbox">
          <BrandMark compact />
          <strong>{current.title}</strong>
        </Link>
        <AccountMenu
          identity={identity}
          placement="header"
          settingsCurrent={currentDestination === "settings"}
        />
      </header>
    </>
  );
}

export function AuthenticatedMobileNavigation({
  currentDestination,
}: {
  currentDestination: AuthenticatedDestination;
}) {
  return (
    <nav className={styles.mobileNavigation} aria-label="Mobile navigation">
      <MobileDestination
        href="/inbox"
        label="Inbox"
        current={currentDestination === "inbox"}
        icon={<Inbox size={20} aria-hidden="true" />}
      />
      <MobileDestination
        href="/settings"
        label="Settings"
        current={currentDestination === "settings"}
        icon={<Settings size={20} aria-hidden="true" />}
      />
    </nav>
  );
}

function MobileDestination({
  current,
  href,
  icon,
  label,
}: {
  current: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link className={styles.mobileDestination} href={href} aria-current={current ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
