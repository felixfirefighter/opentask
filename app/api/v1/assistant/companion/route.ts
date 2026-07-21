import { z } from "zod";

import { createCompanionCheckin } from "@/modules/assistant";
import { getIdentityRequestSecurity, getOnboardingState, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { readBoundedJson } from "@/shared/http/request-security";
import { assertTrustedJsonMutation } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
});

export function POST(request: Request) {
  return observeApiRequest(request, "assistant.companion-checkin", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = requestSchema.parse(await readBoundedJson(request, 512));
    const onboarding = await getOnboardingState(actor);
    return Response.json(
      await createCompanionCheckin(actor, input.name, {
        goals: onboarding.goals,
        recentCheckins: onboarding.checkins.slice(-3),
      }),
      {
        headers: { "cache-control": "no-store" },
      },
    );
  });
}
