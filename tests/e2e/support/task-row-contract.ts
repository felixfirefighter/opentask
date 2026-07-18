import { expect, type Locator, type Page } from "@playwright/test";

export async function readBaseTaskRowContract(row: Locator) {
  return row.evaluate((element) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const rowStyle = getComputedStyle(element);
    const partElement = (name: string) => element.querySelector(`[data-ui-part="${name}"]`) as HTMLElement;
    const partStyle = (name: string) => getComputedStyle(partElement(name));
    const token = (name: string) => rootStyle.getPropertyValue(name).trim().replace(/\s+/g, " ");
    const readTypography = (style: CSSStyleDeclaration) => ({
      fontFamily: style.fontFamily.replace(/\s+/g, " "),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    });
    const readVisualState = (style: CSSStyleDeclaration) => ({
      clipPath: style.clipPath,
      display: style.display,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
    });
    const readBox = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const textFits = (node: HTMLElement) =>
      node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight;
    const readTokenColor = (name: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    const titleElement = partElement("title");
    const metadataElement = partElement("metadata");
    const tagElement = partElement("tag");
    const priorityElement = partElement("priority");
    const statusElement = partElement("status");
    const moreElement = partElement("more");
    const contentElement = partElement("content");
    const contentStyle = getComputedStyle(contentElement);
    const fontProbe = document.createElement("span");
    fontProbe.style.fontFamily = "var(--font-sans)";
    document.body.append(fontProbe);
    const tokenFontFamily = getComputedStyle(fontProbe).fontFamily.replace(/\s+/g, " ");
    fontProbe.remove();

    return {
      viewportWidth: window.innerWidth,
      coarsePointerAvailable: window.matchMedia("(any-pointer: coarse)").matches,
      bodyFontFamily: getComputedStyle(document.body).fontFamily.replace(/\s+/g, " "),
      tokenFontFamily,
      semanticColors: {
        text: readTokenColor("--text"),
        muted: readTokenColor("--text-muted"),
      },
      tokens: {
        fontSans: token("--font-sans"),
        rowSize: token("--type-row-size"),
        rowLine: token("--type-row-line"),
        rowWeight: token("--type-row-weight"),
        compactSize: token("--type-compact-size"),
        compactLine: token("--type-compact-line"),
        compactWeight: token("--type-compact-weight"),
        labelSize: token("--type-label-size"),
        labelLine: token("--type-label-line"),
        labelWeight: token("--type-label-weight"),
        contentGap: token("--space-1"),
        columnGap: token("--space-2"),
        desktopTarget: token("--control-target-desktop"),
        touchTarget: token("--control-target-touch"),
        statusIndicator: token("--task-status-indicator-size"),
        standardHeight: token("--task-row-standard-height"),
        touchHeight: token("--task-row-touch-height"),
      },
      row: {
        box: readBox(element),
        borderBottomWidth: rowStyle.borderBottomWidth,
        columnGap: rowStyle.columnGap,
        minHeight: rowStyle.minHeight,
      },
      title: {
        ...readTypography(partStyle("title")),
        ...readVisualState(partStyle("title")),
        box: readBox(titleElement),
        color: partStyle("title").color,
        textFits: textFits(titleElement),
      },
      titleDescendants: Array.from(titleElement.querySelectorAll("*")).map((descendant) =>
        readTypography(getComputedStyle(descendant)),
      ),
      metadata: {
        ...readTypography(partStyle("metadata")),
        ...readVisualState(partStyle("metadata")),
        box: readBox(metadataElement),
        color: partStyle("metadata").color,
        textFits: textFits(metadataElement),
      },
      tag: {
        ...readTypography(partStyle("tag")),
        ...readVisualState(partStyle("tag")),
        box: readBox(tagElement),
        padding: [
          partStyle("tag").paddingTop,
          partStyle("tag").paddingRight,
          partStyle("tag").paddingBottom,
          partStyle("tag").paddingLeft,
        ],
      },
      priority: {
        ...readVisualState(partStyle("priority")),
        box: readBox(priorityElement),
      },
      contentGap: contentStyle.rowGap,
      contentPadding: [
        contentStyle.paddingTop,
        contentStyle.paddingRight,
        contentStyle.paddingBottom,
        contentStyle.paddingLeft,
      ],
      contentBox: readBox(contentElement),
      trailingBox: readBox(partElement("trailing")),
      status: {
        ...readVisualState(partStyle("status")),
        box: readBox(statusElement),
      },
      more: {
        ...readVisualState(partStyle("more")),
        box: readBox(moreElement),
      },
      statusIndicatorBox: readBox(partElement("status-indicator")),
    };
  });
}

export async function readTaskRowState(row: Locator) {
  return row.evaluate((element) => {
    const part = (name: string) => element.querySelector(`[data-ui-part="${name}"]`) as HTMLElement;
    const typography = (style: CSSStyleDeclaration) => ({
      color: style.color,
      fontFamily: style.fontFamily.replace(/\s+/g, " "),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      textDecorationLine: style.textDecorationLine,
    });
    const visualState = (style: CSSStyleDeclaration) => ({
      clipPath: style.clipPath,
      display: style.display,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
    });
    const box = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    };
    const probe = document.createElement("span");
    document.body.append(probe);
    probe.style.fontFamily = "var(--font-sans)";
    const tokenFontFamily = getComputedStyle(probe).fontFamily.replace(/\s+/g, " ");
    probe.style.color = "var(--text)";
    const textColor = getComputedStyle(probe).color;
    probe.style.color = "var(--text-muted)";
    const mutedColor = getComputedStyle(probe).color;
    probe.remove();

    const title = part("title");
    const status = part("status");
    const more = part("more");
    return {
      viewportWidth: window.innerWidth,
      rowMinHeight: getComputedStyle(element).minHeight,
      title: {
        ...typography(getComputedStyle(title)),
        ...visualState(getComputedStyle(title)),
      },
      titleDescendants: Array.from(title.querySelectorAll("*")).map((descendant) =>
        typography(getComputedStyle(descendant)),
      ),
      metadata: {
        ...typography(getComputedStyle(part("metadata"))),
        ...visualState(getComputedStyle(part("metadata"))),
      },
      tag: visualState(getComputedStyle(part("tag"))),
      indicator: box(part("status-indicator")),
      status: {
        ...box(status),
        ...visualState(getComputedStyle(status)),
      },
      more: {
        ...box(more),
        ...visualState(getComputedStyle(more)),
      },
      tokenFontFamily,
      textColor,
      mutedColor,
    };
  });
}

export async function assertPriorityMarkers(page: Page) {
  const markers = page.locator('[data-ui-part="priority"]');
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThan(0);

  for (let index = 0; index < markerCount; index += 1) {
    const marker = markers.nth(index);
    const state = await marker.evaluate((element) => {
      const style = getComputedStyle(element);
      const priority = element.getAttribute("data-priority");
      const probe = document.createElement("span");
      probe.style.color = `var(--priority-${priority})`;
      document.body.append(probe);
      const expectedColor = getComputedStyle(probe).color;
      probe.remove();
      const bounds = element.getBoundingClientRect();
      return {
        clipPath: style.clipPath,
        color: style.color,
        display: style.display,
        expectedColor,
        height: bounds.height,
        opacity: style.opacity,
        visibility: style.visibility,
        width: bounds.width,
      };
    });

    expect(state).toMatchObject({
      clipPath: "none",
      color: state.expectedColor,
      opacity: "1",
      visibility: "visible",
    });
    expect(state.display).not.toBe("none");
    expect(state.width).toBeGreaterThan(0);
    expect(state.height).toBeGreaterThan(0);
  }
}
