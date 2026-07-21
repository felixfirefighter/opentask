import { revokePushSubscriptionInputSchema } from "@/modules/notifications";
import { getReleaseApplications } from "@/server/release-applications";

import {
  assertNoNotificationApiQuery,
  notificationApiResponse,
  privateNotificationJson,
  readNotificationApiMutation,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return notificationApiResponse(request, "notifications.revoke-subscription", async () => {
    const { actor, input } = await readNotificationApiMutation(
      request,
      revokePushSubscriptionInputSchema,
      "POST",
    );
    assertNoNotificationApiQuery(request);
    const result = await getReleaseApplications().notifications.revokePushSubscription(actor, input);
    return privateNotificationJson(result);
  });
}
