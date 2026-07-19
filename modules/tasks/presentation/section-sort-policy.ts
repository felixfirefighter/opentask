import type { Placement, SectionDto } from "../application/contracts";

export function resolveSectionDrop(
  activeId: string | number,
  overId: string | number | undefined,
  sections: readonly SectionDto[],
): Readonly<{ placement: Placement; section: SectionDto }> | null {
  if (overId === undefined || activeId === overId || !isCompatibleSectionDrop(activeId, overId, sections))
    return null;
  const from = sections.findIndex((section) => sectionSortId(section.id) === String(activeId));
  const to = sections.findIndex((section) => sectionSortId(section.id) === String(overId));
  const section = sections[from];
  const anchor = sections[to];
  if (!section || !anchor) return null;
  return {
    section,
    placement: from < to ? { kind: "after", anchorId: anchor.id } : { kind: "before", anchorId: anchor.id },
  };
}

export function isCompatibleSectionDrop(
  activeId: string | number,
  overId: string | number,
  sections: readonly SectionDto[],
) {
  const active = sections.find((section) => sectionSortId(section.id) === String(activeId));
  const over = sections.find((section) => sectionSortId(section.id) === String(overId));
  return Boolean(active && over && active.listId === over.listId);
}

export function sectionSortId(sectionId: string) {
  return `section:${sectionId}`;
}

export function sectionLabel(id: string | number, sections: readonly SectionDto[]) {
  return sections.find((section) => sectionSortId(section.id) === String(id))?.name ?? "Section";
}

export function sectionPosition(id: string | number, sections: readonly SectionDto[]) {
  const index = sections.findIndex((section) => sectionSortId(section.id) === String(id));
  return index < 0 ? "its original position" : `position ${index + 1} of ${sections.length}`;
}
