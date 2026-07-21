import { registerPushSubscriptionInputSchema } from "@/modules/notifications";
import { getReleaseApplications } from "@/server/release-applications";

import {
  assertNoNotificationApiQuery,
  notificationApiResponse,
  privateNotificationJson,
  readNotificationApiMutation,
} from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return notificationApiResponse(request, "notifications.register-subscription", async () => {
    const { actor, input } = await readNotificationApiMutation(
      request,
      registerPushSubscriptionInputSchema,
      "POST",
    );
    assertNoNotificationApiQuery(request);
    const result = await getReleaseApplications().notifications.registerPushSubscription(actor, input);
    return privateNotificationJson(result);
  });
}
