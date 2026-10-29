import type { DesignElement } from "@ombrique/source";

export function toLayer(
  element: DesignElement,
  depth = 0,
): Record<string, unknown> {
  const tag = element.tag.toLowerCase();
  const isGroupTag = tag === "group";
  const isDisplayContents =
    element.style.some((prop) => prop.key === "display") &&
    element.style.some(
      (prop) => prop.key === "display" && prop.value === "contents",
    );
  const isRuntimeTag =
    tag === "frame" ||
    tag === "rect" ||
    tag === "ellipse" ||
    tag === "star" ||
    tag === "text" ||
    tag === "group" ||
    tag === "image" ||
    tag === "vector" ||
    tag === "boolean";
  const isComponent =
    !isRuntimeTag &&
    !isGroupTag &&
    tag !== "section" &&
    (element.kind === "component" || /^[A-Z]/.test(element.tag));
  const kind = isGroupTag
    ? "group"
    : isDisplayContents
      ? "group"
      : isComponent
        ? "component"
        : tag === "frame" || tag === "section"
          ? "frame"
          : tag === "svg" || tag === "vector" || tag === "boolean"
            ? "vector"
            : tag === "image"
              ? "image"
              : tag === "p" || tag === "h1" || tag === "span" || tag === "div"
                ? "group"
                : "shape";
  const text = element.texts
    .map((t) => t.value)
    .join("")
    .trim();
  return {
    id: element.path.join("/"),
    name:
      element.dataAttrs["data-name"] ??
      (typeof element.attrs.name?.value === "string"
        ? element.attrs.name.value
        : null) ??
      (text.length > 0
        ? text.length > 24
          ? `${text.slice(0, 24)}…`
          : text
        : tag),
    tag,
    kind,
    depth,
    hidden: element.attrs.hidden?.value === true,
    locked: element.dataAttrs["data-locked"] !== undefined,
    generated: element.generated,
    children: element.children.map((child) => toLayer(child, depth + 1)),
  };
}
