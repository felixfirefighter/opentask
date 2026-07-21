import { getReleaseApplications } from "@/server/release-applications";

import {
  assertNoNotificationApiQuery,
  notificationApiResponse,
  privateNotificationJson,
  resolveNotificationApiActor,
} from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return notificationApiResponse(request, "notifications.get-capability", async () => {
    const actor = await resolveNotificationApiActor(request);
    assertNoNotificationApiQuery(request);
    const capability = await getReleaseApplications().notifications.getPushCapability(actor);
    return privateNotificationJson(capability);
  });
}
