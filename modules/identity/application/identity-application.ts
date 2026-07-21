import type { AuthenticatedActor, SessionIdentity } from "@/shared/auth/actor";
import { AuthenticationRequiredError } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";
import type { Clock } from "@/shared/time/clock";
import { Temporal } from "temporal-polyfill";

import { createDemoDatasetSeeder, createInboxBootstrapPort } from "@/modules/tasks";

import type {
  CheckInMood,
  DemoDatasetSeeder,
  DemoEntryResult,
  InboxBootstrapPort,
  OnboardingGoal,
  OnboardingState,
} from "./contracts";
import {
  defaultPreferenceDocument,
  preferenceDocumentSchema,
  preferenceSchemaVersion,
  userPreferencesPatchSchema,
  type UserPreferences,
  type UserPreferencesPatch,
} from "./preferences-contract";
import type { AuthRuntimeConfig } from "../infrastructure/auth-runtime-config";
import { createAccountRepository } from "../infrastructure/account-repository";
import { createAuthenticationGateway } from "../infrastructure/authentication-gateway";
import { createDemoEntryLimiter } from "../infrastructure/demo-entry-limiter";
import { createPreferencesRepository } from "../infrastructure/preferences-repository";
import type { StoredPreferences } from "../infrastructure/preferences-repository";
import { isDemoAccountEmail } from "../infrastructure/demo-account-policy";

export function createIdentityApplication({
  database,
  clock,
  authRuntime,
  inboxPort = createInboxBootstrapPort(database, clock),
  demoSeeder = createDefaultDemoSeeder(database, clock),
  onDailyCheckin,
}: {
  database: Database;
  clock: Clock;
  authRuntime: AuthRuntimeConfig;
  inboxPort?: InboxBootstrapPort;
  demoSeeder?: DemoDatasetSeeder;
  onDailyCheckin?: (
    actor: AuthenticatedActor,
    localDate: string,
    transaction: DatabaseTransaction,
  ) => Promise<void>;
}) {
  const preferencesRepository = createPreferencesRepository(clock);
  const accountRepository = createAccountRepository(database);

  async function bootstrapAccount(userId: string, existingTransaction?: DatabaseTransaction): Promise<void> {
    const bootstrap = async (transaction: DatabaseTransaction) => {
      await preferencesRepository.ensureDefaults(transaction, userId, {
        schemaVersion: preferenceSchemaVersion,
        preferences: defaultPreferenceDocument,
      });
      await inboxPort.ensureInbox(userId, transaction);
    };

    if (existingTransaction) await bootstrap(existingTransaction);
    else await database.transaction(bootstrap);
  }

  const authentication = createAuthenticationGateway({
    database,
    runtime: authRuntime,
    onAccountAvailable: bootstrapAccount,
  });
  const demoEntryLimiter = createDemoEntryLimiter(database, clock);

  async function getOptionalSessionIdentity(headers: Headers): Promise<SessionIdentity | null> {
    const identity = await authentication.findSession(headers);
    if (identity) await bootstrapAccount(identity.actor.userId);
    return identity;
  }

  async function resolveActor(headers: Headers): Promise<AuthenticatedActor> {
    const identity = await getOptionalSessionIdentity(headers);
    if (!identity) throw new AuthenticationRequiredError();
    return identity.actor;
  }

  async function getUserPreferences(actor: AuthenticatedActor): Promise<UserPreferences> {
    const stored = await preferencesRepository.findByUserId(database, actor.userId);
    if (!stored) throw new Error("The authenticated account does not have preferences.");
    return mapPreferences(stored);
  }

  async function getOnboardingState(actor: AuthenticatedActor): Promise<OnboardingState> {
    const preferences = await getUserPreferences(actor);
    const today = localDateForInstant(clock.now(), preferences.timezone);
    return mapOnboardingState(preferences, today);
  }

  async function completeOnboarding(
    actor: AuthenticatedActor,
    goalsInput: readonly OnboardingGoal[],
  ): Promise<OnboardingState> {
    return database.transaction(async (transaction) => {
      const stored = await preferencesRepository.findByUserId(transaction, actor.userId);
      if (!stored) throw new Error("The authenticated account does not have preferences.");
      const current = mapPreferences(stored);
      const goals = preferenceDocumentSchema.shape.onboarding.shape.goals.parse(goalsInput);
      const updated = await preferencesRepository.update(
        transaction,
        actor.userId,
        current.version,
        preferenceDocumentSchema.parse(
          preferenceDocumentFor(current, {
            ...current.onboarding,
            complete: true,
            completedAt: current.onboarding.completedAt ?? clock.now().toISOString(),
            goals,
          }),
        ),
        preferenceSchemaVersion,
      );
      if (!updated) throw preferenceConflict();
      const preferences = mapPreferences(updated);
      return mapOnboardingState(preferences, localDateForInstant(clock.now(), preferences.timezone));
    });
  }

  async function recordCheckin(
    actor: AuthenticatedActor,
    mood: CheckInMood,
    noteInput?: string,
  ): Promise<OnboardingState> {
    return database.transaction(async (transaction) => {
      const stored = await preferencesRepository.findByUserId(transaction, actor.userId);
      if (!stored) throw new Error("The authenticated account does not have preferences.");
      const current = mapPreferences(stored);
      if (!current.onboarding.complete)
        throw new ApplicationError("CONFLICT", "Finish setup before checking in.");

      const today = localDateForInstant(clock.now(), current.timezone);
      const note = noteInput?.trim() || undefined;
      const checkins = [
        ...current.onboarding.checkins.filter((checkin) => checkin.date !== today),
        ...(note ? [{ date: today, mood, note }] : [{ date: today, mood }]),
      ].slice(-30);
      const updated = await preferencesRepository.update(
        transaction,
        actor.userId,
        current.version,
        preferenceDocumentSchema.parse(preferenceDocumentFor(current, { ...current.onboarding, checkins })),
        preferenceSchemaVersion,
      );
      if (!updated) throw preferenceConflict();
      await onDailyCheckin?.(actor, today, transaction);
      const preferences = mapPreferences(updated);
      return mapOnboardingState(preferences, today);
    });
  }

  async function updateUserPreferences(
    actor: AuthenticatedActor,
    expectedVersion: number,
    patchInput: UserPreferencesPatch,
  ): Promise<UserPreferences> {
    const patch = userPreferencesPatchSchema.parse(patchInput);

    return database.transaction(async (transaction) => {
      const stored = await preferencesRepository.findByUserId(transaction, actor.userId);
      if (!stored) throw new Error("The authenticated account does not have preferences.");
      const current = mapPreferences(stored);

      if (current.version !== expectedVersion) throw preferenceConflict();
      const document = preferenceDocumentSchema.parse({
        timezone: patch.timezone ?? current.timezone,
        weekStart: patch.weekStart ?? current.weekStart,
        hourCycle: patch.hourCycle ?? current.hourCycle,
        theme: patch.theme ?? current.theme,
        reducedMotion: patch.reducedMotion ?? current.reducedMotion,
        onboarding: current.onboarding,
      });
      const updated = await preferencesRepository.update(
        transaction,
        actor.userId,
        expectedVersion,
        document,
        preferenceSchemaVersion,
      );
      if (!updated) throw preferenceConflict();
      return mapPreferences(updated);
    });
  }

  async function resetApp(actor: AuthenticatedActor): Promise<void> {
    await accountRepository.deleteAccount(actor.userId);
  }

  async function enterDemo(headers: Headers): Promise<DemoEntryResult> {
    const clientAddress = authentication.findClientAddress(headers);
    // A local browser normally has no proxy-provided client address. Do not make all local
    // visitors share one five-attempt bucket; production still fails closed when the proxy
    // address is missing.
    if (clientAddress || process.env.NODE_ENV === "production") {
      if (!(await demoEntryLimiter.consume(clientAddress ?? "unknown-client"))) {
        throw new ApplicationError("RATE_LIMITED", "Try the demo again in about an hour.");
      }
    }

    const current = await authentication.findSession(headers);
    if (current && isDemoAccountEmail(current.email)) {
      await bootstrapAccount(current.actor.userId);
      await resetDemoWorkspace(current.actor.userId);
      return { actor: current.actor, mode: "reset", setCookieHeaders: [] };
    }

    const created = await authentication.createDemoAccount(headers);
    await bootstrapAccount(created.identity.actor.userId);
    await resetDemoWorkspace(created.identity.actor.userId);
    return {
      actor: created.identity.actor,
      mode: "created",
      setCookieHeaders: created.setCookieHeaders,
    };
  }

  async function resetDemoWorkspace(userId: string): Promise<void> {
    await database.transaction(async (transaction) => {
      const resetPreferences = await preferencesRepository.resetToDefaults(transaction, userId, {
        schemaVersion: preferenceSchemaVersion,
        preferences: defaultPreferenceDocument,
      });
      if (!resetPreferences) throw new Error("Demo reset requires canonical user preferences.");
      await demoSeeder.reset(userId, transaction);
    });
  }

  return {
    bootstrapAccount,
    enterDemo,
    getOptionalSessionIdentity,
    getOnboardingState,
    getUserPreferences,
    completeOnboarding,
    recordCheckin,
    handleAuthRequest: authentication.handle,
    resolveActor,
    resetApp,
    security: authentication.security,
    updateUserPreferences,
  };
}

function createDefaultDemoSeeder(database: Database, clock: Clock): DemoDatasetSeeder {
  const tasks = createDemoDatasetSeeder({ database, clock });
  return {
    async reset(userId: string, existingTransaction?: DatabaseTransaction): Promise<void> {
      // Load the optional assistant reset adapter only when demo entry runs. A static
      // identity -> assistant import would close the assistant -> planning -> identity
      // runtime cycle and prevent ordinary manual planning routes from starting.
      const { createDemoProposalResetter } = await import("@/modules/assistant");
      const proposals = createDemoProposalResetter({ database });
      const reset = async (transaction: DatabaseTransaction) => {
        await proposals.reset(userId, transaction);
        await tasks.reset(userId, transaction);
      };

      if (existingTransaction) await reset(existingTransaction);
      else await database.transaction(reset);
    },
  };
}

function mapPreferences(stored: StoredPreferences): UserPreferences {
  if (stored.schemaVersion !== preferenceSchemaVersion) {
    throw new Error(`Unsupported user preferences schema version: ${stored.schemaVersion}`);
  }
  return {
    schemaVersion: preferenceSchemaVersion,
    version: stored.version,
    ...preferenceDocumentSchema.parse(stored.preferences),
  };
}

function preferenceDocumentFor(current: UserPreferences, onboarding: UserPreferences["onboarding"]) {
  return {
    timezone: current.timezone,
    weekStart: current.weekStart,
    hourCycle: current.hourCycle,
    theme: current.theme,
    reducedMotion: current.reducedMotion,
    onboarding,
  };
}

function preferenceConflict() {
  return new ApplicationError(
    "CONFLICT",
    "Settings changed elsewhere. Review the latest saved values before trying again.",
  );
}

function localDateForInstant(instant: Date, timeZone: string): string {
  return Temporal.Instant.from(instant.toISOString()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

function mapOnboardingState(preferences: UserPreferences, today: string): OnboardingState {
  return {
    complete: preferences.onboarding.complete,
    completedAt: preferences.onboarding.completedAt,
    goals: preferences.onboarding.goals as readonly OnboardingGoal[],
    checkins: preferences.onboarding.checkins,
    todayCheckin: preferences.onboarding.checkins.find((checkin) => checkin.date === today) ?? null,
  };
}
