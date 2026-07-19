import type {
  FolderDto,
  FolderPage,
  RegularListDto,
  RegularListPage,
  SectionDto,
  SectionPage,
  TagDto,
  TagPage,
} from "../../application/contracts";

export function flattenFolderPages(pages: readonly FolderPage[] | undefined): FolderDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function flattenRegularListPages(pages: readonly RegularListPage[] | undefined): RegularListDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function flattenSectionPages(pages: readonly SectionPage[] | undefined): SectionDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function flattenTagPages(pages: readonly TagPage[] | undefined): TagDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}
