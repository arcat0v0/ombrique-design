export const DIALECT_DOC = `# Ombrique TSX dialect

Ombrique projects are normal TSX, SCSS, CSS, JSON, and SVG files. The document service patches source ranges instead of rewriting whole files. Always read a tree before editing, then use returned handles.

## Runtime primitives
- Frame
- Group
- Image
- Text
- Rect
- Ellipse
- Star
- Vector
- Path
- Boolean
- starPoints
- starVertices
- Icon
- Shader
- DEFAULT_ICON_SET
- DEFAULT_ICON_SIZE
- ICON_TAG_CHARS
- decodeIconNodes
- encodeIconNodes
- isIconTag
- getIconSet
- getIconSetKind
- listIconNames
- listIconSets
- missingIconDiagnostic
- registerIconSet
- resolveIcon
- unregisterIconSet
- parseIconifySet
- parseSvgElements
- parseSvgFragment
- parseSvgVector
- shapeToPath
- svgToIconNodes
- svgVectorToNodes
- LUCIDE_ICON_SET

## Runtime props

| Primitive | Core props |
| --- | --- |
| Frame | name, x, y, width, height, fill, layout, align, justify, wrap, gap, padding, grid, radius and per-corner radius |
| Group | name, children; renders display: contents |
| Image | name, x, y, width, height, src, radius, opacity |
| Text | name, x, y, width, fontSize, fill; remaining CSS through style |
| Rect | name, x, y, width, height, fill, radius and per-corner radius, stroke, strokeWidth, opacity |
| Ellipse | name, x, y, width, height, fill, stroke, strokeWidth, opacity |
| Star | name, x, y, width, height, size, points, ratio, fill, stroke, strokeWidth, opacity |
| Vector | name, x, y, width, height, viewBox; SVG children |
| Path | name, x, y, width, height, d, fill, stroke, strokeWidth, fillRule |
| Boolean | name, op (union, subtract, intersect, exclude), fill, stroke, strokeWidth; SVG children |
| Icon | name, x, y, width, height, iconSet, iconName, iconKind, strokeWidth, fill, stroke, opacity |
| Shader | name, x, y, width, height, src, time, radius |

Icon sets register through registerIconSet; resolveIcon returns decoded geometry, and LUCIDE_ICON_SET is the built-in stroke set.

Runtime primitives forward native HTML or SVG attributes, including data-* attributes.

## Multi-axis theme
Themes use native data-* attributes on Frame nodes. Do not use a mode prop. A themeable Frame carries data-mode, for example data-mode="dark"; density or other axes use their own attributes such as data-density="condensed".

tokens.css defines the default axis at :root and theme values with attribute selectors. Combined axes use combined selectors:

[data-mode="dark"][data-density="condensed"] {
  --color-bg: #0b0b10;
}

Token values are CSS custom properties. Edit token cells with setTokenValue. Token mode names use data-mode selectors.

## Icon node spec
createNodes accepts an icon spec: kind set to icon, required name, x, y, width, height, iconSet, iconName, iconKind; iconKind is stroke or fill. Optional fields are strokeWidth, fill, and opacity.

## Shader node spec
createNodes accepts a shader spec: kind set to shader, required name, x, y, width, height, src; optional fields are time (defaults to 0) and radius. src points at a GLSL ES 3.00 fragment shader under shaders/.

Shader v1 is static: only u_time and u_resolution are provided, time defaults to 0, and animation, custom uniforms, pointer hit testing, and off-board clipping are not implemented. A shader is a direct drawable child of the host canvas, sibling to the board, and always z-ordered above the board.

## Edit commands
- setStyle
- setText
- setAttrs
- createNodes
- deleteNodes
- duplicateNode
- reparent
- addPage
- renamePage
- deletePage
- groupNodes
- ungroupNode
- setSharedStyle
- setTokenValue
- createToken
- addTokenMode
- renameTokenMode
- deleteTokenMode
- createComponent
- detachInstance
- flattenBoolean
- createVariantSet

## Command payloads

| Command | Payload |
| --- | --- |
| setStyle | target handle; declarations array of prop and value |
| setText | target handle; text |
| setAttrs | target handle; attrs record of string, number, boolean, or null |
| createNodes | parent handle or null; pageFile; index; specs array of frame, rect, ellipse, star, path, text, image, icon, shader, or component specs |
| deleteNodes | targets array of handles |
| duplicateNode | target handle; dx; dy |
| reparent | target handle; parent handle or null; pageFile; index |
| addPage | name |
| renamePage | pageId; name |
| deletePage | pageId |
| groupNodes | targets array of handles; parent handle or null; pageFile; index; name |
| ungroupNode | target handle |
| setSharedStyle | file; start; end; value |
| setTokenValue | name; value; optional mode or token cell ref |
| createToken | name; value |
| addTokenMode | name |
| renameTokenMode | name; newName |
| deleteTokenMode | name |
| createComponent | target handle; name |
| detachInstance | target handle |
| flattenBoolean | target handle |
| createVariantSet | targets array of handles; name; axes array of name and values |

## Handles

Handles are opaque per-session identifiers scoped to the most recent successful read_tree. A successful read_tree replaces every handle in the session with handles for that page only: one for the page root and one for every element in the returned tree. Handles for other pages become invalid immediately, and read_node, apply_edits, or select with such a handle fails with handle_not_found. Re-reading the same page also replaces its handles with a fresh set. read_node does not issue handles.

A handle records file, path, tag, dataName, and a fragment hash. Never construct NodeRef offsets. Before an edit the shim resolves the handle by path and checks the fragment hash. If the node's ref, tag, name, text, style, props, or data attributes changed, the handle fails with stale_handle; re-read the page.

Handle lifetime:
- A successful read_tree replaces the whole session handle set with the returned page's handles; other pages' handles are invalidated.
- A failed read_tree (bridge error, invalid tree, or handle_limit) leaves the previous handle set unchanged; a generation change still invalidates everything.
- Structural commands invalidate every handle for each file they change: createNodes, deleteNodes, reparent, groupNodes, ungroupNode, duplicateNode, createComponent, createVariantSet, detachInstance, flattenBoolean.
- Page commands invalidate every handle in the session: addPage, renamePage, deletePage.
- A generation change (project opened or switched) invalidates every handle in the session.

A session may hold handles for at most one page, capped at 2000 handles for that page. Handles never accumulate across pages. If a page needs more than 2000 handles, read_tree fails with handle_limit; re-reading the same page cannot help. Reduce the page size, split the page into smaller pages, or start a new session.

Because only the latest page holds handles, cross-page operations require reading each page again before editing it. apply_edits cannot mix handles from two pages; a batch must target the page most recently read.

## Batch atomicity

apply_edits sends all commands in one applyCommands transaction. The document service verifies every planned file before writing, then writes the whole batch or rejects it. A failure returns the failing command index when handle validation fails and the current file versions. Never retry a failed batch with stale handles; re-read the affected tree first.
`;
