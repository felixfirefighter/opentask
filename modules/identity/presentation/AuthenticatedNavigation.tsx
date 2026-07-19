import { ListTodo, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { SessionIdentity } from "@/modules/identity";
import { BrandMark } from "@/shared/presentation";

import { AccountMenu } from "./AccountMenu";
import styles from "./AuthenticatedShell.module.css";

export type AuthenticatedDestination = "tasks" | "settings";

const destinationDetails = {
  tasks: { title: "Tasks", eyebrow: "Workspace", icon: ListTodo, href: "/inbox" },
  settings: { title: "Settings", eyebrow: "Account", icon: Settings, href: "/settings" },
} as const;

export function AuthenticatedNavigation({
  currentDestination,
  destinationTitle,
  compactNavigation,
  contextNavigation,
  identity,
  topBarActions,
}: {
  currentDestination: AuthenticatedDestination;
  destinationTitle?: string | undefined;
  compactNavigation?: ReactNode;
  contextNavigation?: ReactNode;
  identity: SessionIdentity;
  topBarActions?: ReactNode;
}) {
  const details = destinationDetails[currentDestination];
  const current = { ...details, title: destinationTitle ?? details.title };

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
            aria-label="Tasks"
            aria-current={currentDestination === "tasks" ? "page" : undefined}
            title="Tasks"
          >
            <ListTodo size={19} aria-hidden="true" />
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
        {contextNavigation ?? (
          <nav className={styles.contextLinks} aria-label={`${current.title} destinations`}>
            <Link className={styles.contextLink} href={current.href} aria-current="page">
              <current.icon size={18} aria-hidden="true" />
              <span>{current.title}</span>
            </Link>
          </nav>
        )}
      </aside>

      <header className={styles.topBar}>
        <div className={styles.topBarStart}>
          {compactNavigation}
          <Link
            className={styles.topBarIdentity}
            href={current.href}
            aria-label={`OpenTask ${current.title}`}
          >
            <BrandMark compact />
            <strong>{current.title}</strong>
          </Link>
        </div>
        <div className={styles.topBarActions}>
          {topBarActions}
          <AccountMenu
            identity={identity}
            placement="header"
            settingsCurrent={currentDestination === "settings"}
          />
        </div>
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
        label="Tasks"
        current={currentDestination === "tasks"}
        icon={<ListTodo size={20} aria-hidden="true" />}
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
