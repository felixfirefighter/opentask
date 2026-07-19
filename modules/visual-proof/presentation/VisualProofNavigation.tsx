import {
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  CircleDot,
  Command,
  Inbox,
  ListTodo,
  MoreHorizontal,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark, ThemeToggle } from "@/shared/presentation";

import styles from "./VisualProofShell.module.css";

export type ActiveDestination = "today" | "tasks" | "calendar" | "plan";
const moduleLinks = [
  { key: "today", href: "/today", label: "Today", icon: CircleDot },
  { key: "tasks", href: "/tasks/demo", label: "Tasks", icon: CheckSquare2 },
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays },
  { key: "plan", href: "/plan", label: "Plan", icon: Sparkles },
] as const;

const mobileTitles: Record<ActiveDestination, string> = {
  today: "Today",
  tasks: "Tasks",
  calendar: "Calendar",
  plan: "Plan",
};
export function VisualProofNavigation({ active }: { active: ActiveDestination }) {
  return (
    <>
      <nav className={styles.rail} aria-label="Product modules">
        <Link className={styles.railBrand} href="/" aria-label="OpenTask home">
          <BrandMark compact />
        </Link>
        <div className={styles.railLinks}>
          {moduleLinks.map(({ key, href, label, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              className={styles.railLink}
              aria-current={active === key ? "page" : undefined}
              aria-label={label}
              title={label}
            >
              <Icon size={19} strokeWidth={active === key ? 2.4 : 1.9} />
            </Link>
          ))}
        </div>
        <div className={styles.railFooter}>
          <ThemeToggle />
        </div>
      </nav>

      <aside className={styles.sidebar} aria-label="Task navigation">
        <div className={styles.sidebarTop}>
          <div>
            <p className="eyebrow">Workspace</p>
            <strong>My day</strong>
          </div>
          <button className="icon-button" type="button" aria-label="Search tasks" title="Search tasks">
            <Search size={18} />
          </button>
        </div>

        <nav className={styles.contextNav} aria-label="Task destinations">
          <ContextLink href="/tasks/demo" icon={<Inbox size={17} />} label="Inbox" count="7" />
          <ContextLink
            href="/today"
            icon={<CircleDot size={17} />}
            label="Today"
            count="5"
            active={active === "today"}
          />
          <ContextLink href="/calendar" icon={<CalendarDays size={17} />} label="Upcoming" />
          <ContextLink href="/completed" icon={<CheckSquare2 size={17} />} label="Completed / Cancelled" />
        </nav>

        <div className={styles.listGroup}>
          <button type="button" className={styles.groupLabel} aria-expanded="true">
            <ChevronDown size={15} /> Personal
          </button>
          <ContextLink
            href="/tasks/demo"
            icon={<ListTodo size={16} />}
            label="Build Week"
            count="4"
            accent="coral"
          />
          <ContextLink
            href="/tasks/demo"
            icon={<ListTodo size={16} />}
            label="Launch prep"
            count="3"
            accent="mint"
          />
        </div>

        <div className={styles.sidebarTip}>
          <Command size={15} aria-hidden="true" />
          <span>Press ⌘ K to search</span>
        </div>
        <p className={styles.fixtureLabel}>Visual proof · local fixtures</p>
      </aside>

      <header className={styles.mobileHeader}>
        <div className={styles.mobileContext}>
          <BrandMark compact />
          <strong>{mobileTitles[active]}</strong>
        </div>
        <div className={styles.mobileActions}>
          <button type="button" className="icon-button" aria-label="Search tasks">
            <Search size={19} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <nav className={styles.mobileNav} aria-label="Product modules">
        <MobileLink href="/today" label="Today" active={active === "today"} icon={<CircleDot size={20} />} />
        <MobileLink
          href="/tasks/demo"
          label="Tasks"
          active={active === "tasks"}
          icon={<CheckSquare2 size={20} />}
        />
        <MobileLink
          href="/calendar"
          label="Calendar"
          active={active === "calendar"}
          icon={<CalendarDays size={20} />}
        />
        <MobileLink href="/plan" label="Plan" active={active === "plan"} icon={<Sparkles size={20} />} />
        <details className={styles.moreMenu}>
          <summary aria-label="More destinations">
            <MoreHorizontal size={20} />
            <span>More</span>
          </summary>
          <div className={styles.moreSheet}>
            <Link href="/completed">
              <CheckSquare2 size={18} /> Completed / Cancelled
            </Link>
          </div>
        </details>
      </nav>
    </>
  );
}

function ContextLink({
  href,
  icon,
  label,
  count,
  active,
  accent,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count?: string;
  active?: boolean;
  accent?: "coral" | "mint";
}) {
  return (
    <Link className={styles.contextLink} data-active={active || undefined} href={href}>
      <span className={styles.contextIcon} data-accent={accent}>
        {icon}
      </span>
      <span>{label}</span>
      {count && <span className={styles.count}>{count}</span>}
    </Link>
  );
}

function MobileLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link className={styles.mobileLink} href={href} aria-current={active ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
