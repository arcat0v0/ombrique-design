function resolveVariables(
  cssText: string,
  element: HTMLElement | SVGElement,
): string {
  return cssText.replace(/var\((--[^), ]+)[^)]*\)/g, (match, varName) => {
    try {
      const val = window
        .getComputedStyle(element)
        .getPropertyValue(varName)
        .trim();
      return val || match;
    } catch {
      return match;
    }
  });
}

function removeDataAttributes(node: Element) {
  for (const attr of Array.from(node.attributes)) {
    if (
      attr.name.startsWith("data-") ||
      attr.name === "data-name" ||
      attr.name === "data-ombrique-id" ||
      attr.name === "data-board-id"
    ) {
      node.removeAttribute(attr.name);
    }
  }
  for (const child of Array.from(node.children)) {
    removeDataAttributes(child);
  }
}

export function serializeNodeToSvg(
  targetEl: HTMLElement | SVGElement,
  options?: { scale?: number },
): string {
  const scale = options?.scale && options.scale > 0 ? options.scale : 1;
  const rect = targetEl.getBoundingClientRect();
  const width = Math.max(1, Math.round((rect.width || 100) * scale));
  const height = Math.max(1, Math.round((rect.height || 100) * scale));

  if (targetEl instanceof SVGSVGElement) {
    const clone = targetEl.cloneNode(true) as SVGSVGElement;
    removeDataAttributes(clone);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("viewBox")) {
      clone.setAttribute(
        "viewBox",
        `0 0 ${rect.width || 100} ${rect.height || 100}`,
      );
    }
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const raw = clone.outerHTML;
    return resolveVariables(raw, targetEl);
  }

  const innerSvg = targetEl.querySelector("svg");
  if (innerSvg && targetEl.children.length === 1) {
    return serializeNodeToSvg(innerSvg, options);
  }

  if (targetEl instanceof SVGGraphicsElement) {
    const clone = targetEl.cloneNode(true) as SVGGraphicsElement;
    removeDataAttributes(clone);
    const content = resolveVariables(clone.outerHTML, targetEl);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rect.width || 100} ${rect.height || 100}" width="${width}" height="${height}">${content}</svg>`;
  }

  const isChildless =
    targetEl.children.length === 0 && !targetEl.textContent?.trim();
  const computed = window.getComputedStyle(targetEl);
  const rawRadius = computed.borderRadius || targetEl.style.borderRadius;

  if (
    isChildless &&
    (rawRadius === "50%" || targetEl.style.borderRadius === "50%")
  ) {
    const cx = (rect.width || 100) / 2;
    const cy = (rect.height || 100) / 2;
    const fill =
      computed.backgroundColor || targetEl.style.background || "none";
    const stroke = computed.borderColor || targetEl.style.borderColor || "none";
    const strokeWidth = computed.borderWidth
      ? Number.parseFloat(computed.borderWidth) || 0
      : 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rect.width || 100} ${rect.height || 100}" width="${width}" height="${height}">
  <ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
</svg>`;
  }

  if (isChildless && targetEl.tagName.toLowerCase() === "div") {
    const fill =
      computed.backgroundColor || targetEl.style.background || "none";
    const stroke = computed.borderColor || targetEl.style.borderColor || "none";
    const strokeWidth = computed.borderWidth
      ? Number.parseFloat(computed.borderWidth) || 0
      : 0;
    const rx = Number.parseFloat(rawRadius) || 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rect.width || 100} ${rect.height || 100}" width="${width}" height="${height}">
  <rect x="0" y="0" width="${rect.width || 100}" height="${rect.height || 100}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
</svg>`;
  }

  const clone = targetEl.cloneNode(true) as HTMLElement;
  removeDataAttributes(clone);
  clone.style.margin = "0";
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.transform = "none";

  const rawHtml = clone.outerHTML;
  const resolvedHtml = resolveVariables(rawHtml, targetEl);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rect.width || 100} ${rect.height || 100}" width="${width}" height="${height}">
  <foreignObject x="0" y="0" width="${rect.width || 100}" height="${rect.height || 100}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;margin:0;padding:0;">
      ${resolvedHtml}
    </div>
  </foreignObject>
</svg>`;
}
