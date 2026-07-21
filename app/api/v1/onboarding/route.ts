import { z } from "zod";

import {
  completeOnboarding,
  getIdentityRequestSecurity,
  getOnboardingState,
  recordCheckin,
  resolveActor,
} from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const goalSchema = z.union([
  z.enum(["discipline", "tasks", "habits", "reminders", "daily_planning", "scheduling", "other"]),
  z.string().regex(/^other:.{1,160}$/u),
]);
const completeSchema = z.strictObject({ goals: z.array(goalSchema).min(1).max(7) });
const checkinSchema = z.strictObject({
  mood: z.enum(["good", "tired", "heavy", "ready"]),
  note: z.string().max(500).optional(),
});

export function GET(request: Request) {
  return observeApiRequest(request, "identity.get-onboarding", async () => {
    const actor = await resolveActor(request.headers);
    return privateJson(await getOnboardingState(actor));
  });
}

export function POST(request: Request) {
  return observeApiRequest(request, "identity.complete-onboarding", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = completeSchema.parse(await readBoundedJson(request, 4096));
    return privateJson(await completeOnboarding(actor, input.goals));
  });
}

export function PATCH(request: Request) {
  return observeApiRequest(request, "identity.record-checkin", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const input = checkinSchema.parse(await readBoundedJson(request, 2048));
    return privateJson(await recordCheckin(actor, input.mood, input.note));
  });
}

function privateJson(value: unknown) {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
