import type * as PlanningModule from "@/modules/planning";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getApplication: vi.fn(),
  application: {
    getToday: vi.fn(),
    getUpcoming: vi.fn(),
    getCalendarRange: vi.fn(),
    getAgendaRange: vi.fn(),
    getEisenhower: vi.fn(),
  },
}));

vi.mock("@/modules/identity", () => ({ resolveActor: mocks.resolveActor }));
vi.mock("@/modules/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof PlanningModule>()),
  getPlanningProjectionApplication: mocks.getApplication,
}));

import { GET as getAgenda } from "./agenda/route";
import { GET as getCalendar } from "./calendar/route";
import { GET as getMatrix } from "./matrix/route";
import { GET as getToday } from "./today/route";
import { GET as getUpcoming } from "./upcoming/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };

describe("planning projection API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getApplication.mockReturnValue(mocks.application);
    for (const method of Object.values(mocks.application)) {
      method.mockResolvedValue({ truncated: false });
    }
  });

  it("authenticates and dispatches every bounded projection with private responses", async () => {
    const requests = [
      [getToday, "today?limit=20", mocks.application.getToday, { limit: 20 }],
      [getUpcoming, "upcoming", mocks.application.getUpcoming, { limit: 250 }],
      [getMatrix, "matrix?limit=30", mocks.application.getEisenhower, { limit: 30 }],
      [
        getCalendar,
        "calendar?rangeStartDate=2026-07-01&rangeEndDate=2026-08-01&limit=40",
        mocks.application.getCalendarRange,
        { rangeStartDate: "2026-07-01", rangeEndDate: "2026-08-01", limit: 40 },
      ],
      [
        getAgenda,
        "agenda?rangeStartDate=2026-07-19&rangeEndDate=2026-07-26",
        mocks.application.getAgendaRange,
        { rangeStartDate: "2026-07-19", rangeEndDate: "2026-07-26", limit: 250 },
      ],
    ] as const;

    for (const [handler, path, method, query] of requests) {
      const response = await handler(new Request(`http://localhost:3000/api/v1/planning/${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(method).toHaveBeenCalledWith(actor, query);
    }
    expect(mocks.resolveActor).toHaveBeenCalledTimes(5);
  });

  it("rejects unknown, duplicate, and oversized range queries before dispatch", async () => {
    const responses = await Promise.all([
      getToday(new Request("http://localhost:3000/api/v1/planning/today?unknown=1")),
      getMatrix(new Request("http://localhost:3000/api/v1/planning/matrix?limit=1&limit=2")),
      getCalendar(
        new Request(
          "http://localhost:3000/api/v1/planning/calendar?rangeStartDate=2026-07-01&rangeEndDate=2026-09-03",
        ),
      ),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400]);
    expect(Object.values(mocks.application).every((method) => method.mock.calls.length === 0)).toBe(true);
  });

  it("returns 401 and never dispatches when the session is absent", async () => {
    mocks.resolveActor.mockRejectedValue(
      Object.assign(new Error("private auth detail"), { code: "UNAUTHENTICATED" }),
    );
    const response = await getToday(new Request("http://localhost:3000/api/v1/planning/today"));

    expect(response.status).toBe(401);
    expect(mocks.application.getToday).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private auth detail");
  });
});
