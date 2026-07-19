import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createChecklistApplication } from "./checklist-application";
import { createFolderApplication } from "./folder-application";
import { createListApplication } from "./list-application";
import { createSearchApplication } from "./search-application";
import { createQuickAddApplication } from "./quick-add-application";
import { createSectionApplication } from "./section-application";
import { createTagApplication } from "./tag-application";
import { createTaskApplication } from "./task-application";

export function createTasksApplication({ database, clock }: { database: Database; clock: Clock }) {
  return {
    folders: createFolderApplication({ database, clock }),
    lists: createListApplication({ database, clock }),
    sections: createSectionApplication({ database, clock }),
    tasks: createTaskApplication({ database, clock }),
    checklist: createChecklistApplication({ database, clock }),
    tags: createTagApplication({ database, clock }),
    search: createSearchApplication({ database }),
    quickAdd: createQuickAddApplication({ clock }),
  } as const;
}

export type TasksApplication = ReturnType<typeof createTasksApplication>;
