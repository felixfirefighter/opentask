import { Archive, ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import { HabitHistoryLoading } from "./HabitCondition";
import detailStyles from "./HabitDetailScreen.module.css";
import styles from "./HabitLoadingScreens.module.css";
import workspaceStyles from "./HabitWorkspaceScreen.module.css";

export function HabitWorkspaceLoadingScreen() {
  return (
    <div className={workspaceStyles.page} data-loading-shape="habit-workspace">
      <header className={workspaceStyles.pageHeader}>
        <div>
          <p className="eyebrow">Practice</p>
          <h1 tabIndex={-1} data-route-focus>
            Habits
          </h1>
          <p id="habit-workspace-loading-description">Loading habit summaries</p>
        </div>
        <Button type="button" disabled aria-describedby="habit-workspace-loading-description">
          <Plus size={17} aria-hidden="true" /> Create habit
        </Button>
      </header>
      <nav className={workspaceStyles.viewControl} aria-label="Habit view">
        <Link href="/habits">Active</Link>
        <Link href="/habits?view=archived">Archived</Link>
      </nav>
      <div className={styles.workspaceList} aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <HabitSummarySkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function HabitDetailLoadingScreen() {
  return (
    <div className={detailStyles.page} data-loading-shape="habit-detail">
      <Link className={detailStyles.back} href="/habits">
        <ChevronLeft size={18} aria-hidden="true" /> Back to habits
      </Link>
      <header className={detailStyles.pageHeader}>
        <div className={detailStyles.identity}>
          <span className={`${detailStyles.icon} ${styles.detailIcon}`} aria-hidden="true" />
          <div>
            <p className="eyebrow">Habits</p>
            <div className={detailStyles.titleLine}>
              <h1 tabIndex={-1} data-route-focus>
                Habit details
              </h1>
            </div>
            <p className={styles.detailCaption} id="habit-detail-loading-description">
              Loading the habit definition
            </p>
          </div>
        </div>
        <div className={detailStyles.headerActions}>
          <Button
            type="button"
            variant="secondary"
            disabled
            aria-describedby="habit-detail-loading-description"
          >
            Edit habit
          </Button>
          <Button type="button" variant="quiet" disabled aria-describedby="habit-detail-loading-description">
            <Archive size={16} aria-hidden="true" /> Archive
          </Button>
        </div>
      </header>
      <section className={detailStyles.summary} aria-labelledby="habit-loading-summary-heading">
        <div>
          <h2 id="habit-loading-summary-heading">Current practice</h2>
          <LoadingLines count={3} />
        </div>
        <span className={styles.actionSkeleton} aria-hidden="true" />
      </section>
      <section className={detailStyles.recent} aria-labelledby="habit-loading-seven-day-heading">
        <h2 id="habit-loading-seven-day-heading">Last seven days</h2>
        <div className={styles.daySkeletons} aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </section>
      <section className={detailStyles.history} aria-labelledby="habit-loading-history-heading">
        <header>
          <div>
            <h2 id="habit-loading-history-heading">Monthly history</h2>
            <p>Habit history</p>
          </div>
          <div className={detailStyles.monthActions}>
            <Button type="button" variant="quiet" disabled>
              Previous month
            </Button>
            <Button type="button" variant="quiet" disabled>
              Next month
            </Button>
          </div>
        </header>
        <HabitHistoryLoading />
      </section>
    </div>
  );
}

function HabitSummarySkeleton() {
  return (
    <article className={styles.summaryRow} data-loading-shape="habit-summary">
      <span className={styles.summaryIcon} />
      <span className={styles.summaryCopy}>
        <span />
        <span />
        <span />
      </span>
      <span className={styles.summaryAction} />
    </article>
  );
}

function LoadingLines({ count }: Readonly<{ count: number }>) {
  return (
    <div className={styles.loadingLines} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
