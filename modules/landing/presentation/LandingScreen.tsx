import { ArrowRight, CalendarDays, Check, Clock3, Scale, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark, Button, ThemeToggle } from "@/shared/presentation";

import previewStyles from "./LandingPreview.module.css";
import styles from "./LandingScreen.module.css";

export function LandingScreen({ signedIn, demoAction }: { signedIn: boolean; demoAction: ReactNode }) {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <BrandMark />
        <nav className={styles.headerNav} aria-label="Public navigation">
          <ThemeToggle />
          {signedIn ? (
            <Button asChild>
              <Link href="/inbox">Open app</Link>
            </Button>
          ) : (
            <>
              <Link className={styles.signInLink} href="/sign-in">
                Sign in
              </Link>
              <Button asChild>
                <Link href="/sign-up">Create account</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className="proof-badge">
              <Sparkles size={15} /> Open-source personal planning
            </p>
            <h1>Make room for what matters.</h1>
            <p className={styles.lede}>
              Capture tasks quickly, plan them against real time, and review optional AI proposals without
              putting useful features behind a premium tier.
            </p>
            <div className={styles.heroActions}>
              {signedIn ? (
                <Button asChild>
                  <Link href="/inbox">
                    Open your Inbox <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild>
                    <Link href="/sign-up">
                      Create account <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </Button>
                  {demoAction}
                </>
              )}
            </div>
            <p className={styles.trustLine}>
              <ShieldCheck size={16} /> Manual workflows always work without an AI key.
            </p>
          </div>

          <ProductComposition />
        </section>

        <section className={styles.valueGrid} aria-labelledby="why-opentask">
          <div className={styles.sectionIntro}>
            <p className="eyebrow">One calm workspace</p>
            <h2 id="why-opentask">Plan, then make progress.</h2>
            <p>
              Every view reflects the same task truth. Nothing is copied into a separate calendar or AI state.
            </p>
          </div>
          <ValueCard
            icon={<Check size={19} />}
            title="Capture without ceremony"
            text="Quick add keeps recognized dates visible and editable before save."
          />
          <ValueCard
            icon={<CalendarDays size={19} />}
            title="See work in real time"
            text="See the same task in Today, Calendar, and Matrix without losing context."
          />
          <ValueCard
            icon={<Sparkles size={19} />}
            title="AI proposes, you decide"
            text="Review an editable before-and-after diff before any change is applied."
          />
        </section>
      </main>

      <footer className={styles.footer}>
        <BrandMark />
        <p>Independent, self-hostable, and designed without copied competitor assets or trade dress.</p>
        <span className={styles.footerLink}>
          <Scale size={16} aria-hidden="true" /> AGPL-3.0-or-later
        </span>
      </footer>
    </div>
  );
}

function ProductComposition() {
  return (
    <div
      className={previewStyles.composition}
      role="img"
      aria-label="OpenTask preview showing a Today list beside three reviewable planning changes"
    >
      <div className={previewStyles.previewWindow} aria-hidden="true">
        <div className={previewStyles.previewChrome}>
          <span />
          <span />
          <span />
          <p>Today</p>
        </div>
        <div className={previewStyles.previewBody}>
          <aside className={previewStyles.previewSidebar}>
            <span className={previewStyles.previewLogo}>✓</span>
            <span data-active="true" />
            <span />
            <span />
          </aside>
          <div className={previewStyles.previewMain}>
            <div className={previewStyles.previewHeading}>
              <div>
                <small>Today</small>
                <strong>Prepare for the workshop</strong>
              </div>
              <span className={previewStyles.previewButton}>Add task</span>
            </div>
            <p className={previewStyles.previewSection}>Timed</p>
            <PreviewTask title="Outline the workshop agenda" time="10:30 AM" tone="coral" />
            <PreviewTask title="Review event page on mobile" time="2:00 PM" tone="sky" />
            <p className={previewStyles.previewSection}>Anytime</p>
            <PreviewTask title="Prepare attendee notes" time="Today" tone="amber" />
          </div>
        </div>
      </div>

      <div className={previewStyles.proposalFloat} aria-hidden="true">
        <div className={previewStyles.proposalIcon}>
          <Sparkles size={16} />
        </div>
        <div>
          <small>Review before apply</small>
          <strong>3 changes fit your day</strong>
          <span>
            <Clock3 size={13} /> 2h 15m planned · 1 conflict
          </span>
        </div>
        <span className={previewStyles.proposalCheck}>✓</span>
      </div>
    </div>
  );
}

function PreviewTask({ title, time, tone }: { title: string; time: string; tone: string }) {
  return (
    <div className={previewStyles.previewTask}>
      <span className={previewStyles.previewCircle} />
      <strong>{title}</strong>
      <time>{time}</time>
      <span className={previewStyles.previewAccent} data-tone={tone} />
    </div>
  );
}

function ValueCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className={styles.valueCard}>
      <span className={styles.valueIcon}>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
