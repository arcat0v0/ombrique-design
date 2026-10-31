# Ombrique (安布里克)

> Code-native, agent-friendly collaborative design environment.  
> TSX 方言作为设计稿真源，WebGPU 画布高性能呈现，原子补丁精准写盘与热重载。

---

## 核心特性

- **代码即真源 (Code as Single Source of Truth)**: 设计稿直接使用合法 TSX 组件表达。没有私有二进制格式，文件直接在 Git 中版本化、分支协作与 Code Review。
- **WebGPU HTML-in-Canvas 合成器**: 将 Chromium 原生排版、字形与 CSS 布局通过 GPU 纹理管线合成在无限画布上，保证 100% 像素级真实还原同时维持 60 FPS 流畅平移与缩放。
- **细粒度 AST 补丁计划器 (PatchPlanner)**: 基于 oxc 高速 AST 分析与 TypeScript/SCSS 增量更新。任何画布拖拽与属性调节，仅生成最小字符级差异，绝无全量重新格式化污染。
- **双向协同服务 (DocService)**: 支持事务性原子写盘、文件系统外部变更监听重放、全局命令撤销/重做栈与版本向量冲突控制。
- **桌面端交互外壳 (Desktop Shell)**: 完备的图层树（Layers）、页面管理（Pages）、属性检查器（Properties）、工具栏（Toolbar）与快捷键（撤销/重做/复制/删除）。支持画布内容高清 PNG 导出。

---

## 架构拓扑

```
ombrique-design/
├── packages/
│   ├── protocol/       # 全局进程间通信消息契约与编辑命令 Schema 验证
│   ├── source/         # oxc AST 解析器、DesignIndex 符号索引与 PatchPlanner
│   ├── doc-service/    # 项目状态模型、原子事务落盘、文件监听与撤销重做栈
│   ├── compiler/       # Vite 运行时管线、自定义协议加载器与 HotChannel HMR
│   ├── runtime/        # 核心设计原语: Frame, Rect, Ellipse, Star, Text, Image
│   ├── canvas/         # WebGPU 画布合成器、纹理上传队列、增量重绘与相机投影
│   └── editor-ui/      # 编辑器外壳组件体系 (Toolbar, Panels, DiagnosticsBar)
└── apps/
    └── desktop/        # Electron + React 桌面端主进程、DocHost 与画布桥接
```

---

## 快速上手

### 环境依赖

- Node.js >= 20.x
- pnpm >= 9.x
- 支持 WebGPU 的显卡驱动环境 (Vulkan / D3D12 / Metal)

### 安装依赖与构建

```bash
# 安装整个 monorepo 依赖
pnpm install

# 运行全量类型检查
pnpm -r typecheck

# 运行全包单元测试与集成测试
pnpm -r test
```

### 启动桌面应用

```bash
# 构建桌面端资源并在 Electron 中启动
pnpm --filter @ombrique/desktop build
pnpm --filter @ombrique/desktop start
```

---

## 编辑器 UI 架构与规范

编辑器外壳 (`@ombrique/editor-ui`) 基于 **Tailwind CSS v4** 与 **shadcn/ui** 原生重构，完全对齐 Figma 专业设计桌面体验：

- **暗色语义主题 (Semantic Theme)**: 沉浸式暗色设计工位，基于 CSS 语义变量实现高对比度、低疲劳度的紧凑层级。
- **三栏式弹性工作区 (Workspace)**: 支持拖拽调整宽度的左侧导航面板、中间 WebGPU 画布、右侧分组属性检查器，集成底部诊断与系统状态栏。
- **顶部工具栏 (Toolbar)**:
  - 工具切换：选择 (`V`)、抓手 (`H`)。
  - 矢量与原语插入：Frame、矩形、椭圆、星形、文字、本地图片。
  - 节点组织操作：快速编组、解组、布尔展平 (Flatten)、提取为主组件。
  - 视图缩放控制器：预设档位 (25% / 50% / 75% / 100% / 150% / 200%) 下拉菜单与一键自适应画布居中。
  - 导出枢纽：支持页面级与选中图层级的 PNG / JPG / WebP / SVG / PDF 高清导出。
- **图层与导航系统 (Pages & Layers)**:
  - 多页面切换、新增、内联双击重命名与防误删提示。
  - 递归图层树：无限级折叠/展开、拖拽防穿透事件隔离、双击重命名、右键上下文菜单。
  - 图层行悬浮快捷操作：实时锁定/解锁与显隐切换，具备按图层安全操作机制与防止旧状态误操作保障。
  - 设计变量面板 (Tokens)：CSS 变量可视化检索、颜色卡片即时预览与快速注入。
  - 变量模式以 `tokens.css` 的 `:root` 表示默认值，额外模式使用 `[data-mode="dark"]`。默认模式可通过 `:root, [data-mode="light"]` 命名；变量表支持逐模式编辑和新增、重命名、删除模式，新增模式复制默认值。
- **属性检查器 (Properties Inspector)**:
  - **类型专属卡片**：针对 `Frame` (Auto Layout 方向/间距/内边距/对齐/换行)、`Text` (多行内容编辑与排版)、`Image` (源路径/透明度/圆角)、`Boolean` (并集/交集/差集/异或运算切换)、`Component` (主组件实例分离保护) 深度定制。
  - **几何与约束 (Geometry & Constraints)**: X/Y 坐标与 W/H 尺寸精准输入；位置与边距约束锚定。
  - **智能样式去重**：专用卡片属性自动从通用属性表中剔除，消除混杂重复呈现。
  - **Token 智能绑定**：支持十六进制与颜色变量智能解析联动。
  - **Frame 变量模式**：属性检查器可设置 `<Frame mode="dark">`，运行时输出 `data-mode` 并通过真实 CSS 级联影响后代；选择继承会移除显式模式。重命名模式同步更新 Frame 引用，删除非默认模式后引用恢复继承。
  - **Figma 级导出配置 (Export)**：支持选中节点与当前画板的多行导出设置（倍率 0.5x/1x/2x/3x/4x 或自定义宽度如 512w、格式 PNG/JPG/SVG/PDF/WebP、自定义后缀），通过 `data-export` 属性无缝持久化至 TSX 源码；支持单文件直接保存或多配置批量导出到目录。
  - 模态弹窗（新建变量、创建组件、页面管理、实例分离）均经过侧边栏可视区域物理锚定，彻底解决 Electron 原生画布子视图遮挡前端弹出层的问题。

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl + Z` / `Cmd + Z` | 撤销上一步编辑操作 |
| `Ctrl + Shift + Z` / `Ctrl + Y` | 重做已撤销操作 |
| `Ctrl + D` / `Cmd + D` | 原地复制当前选中图层 |
| `Delete` / `Backspace` | 删除当前选中的节点 |
---

## 规范与质量保证

- **Biome**: 统一的 Lint 与 Formatting 标准。
- **Vitest**: 覆盖率 > 180 个针对 AST 回写、事务落盘、协议解析与 UI 行为的单元和集成测试。
- **End-to-End (E2E)**: 集成无头模式渲染端对端测试与导出验证流程。
