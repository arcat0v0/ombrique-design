# Shader 节点捕获探针报告

日期：2026-11-04
探针目录：`prototype/`
原始数据：`prototype/out/shader-capture-results.json`、`prototype/out/shader-anim-results.json`
截图：`prototype/out/shots/shader-capture-composited.png`、`prototype/out/shots/shader-anim-final.png`

## 0. 运行方式（一条命令）

```bash
cd /home/arcat/Develop/ombrique/ombrique-design/prototype
npm run shader:all
```

等价的分别执行：

```bash
PROTO_MODE=shader-capture ./node_modules/.bin/electron .
PROTO_MODE=shader-anim   ./node_modules/.bin/electron .
```

两个模式各自退出并把完整 JSON 写到 `out/shader-capture-results.json` / `out/shader-anim-results.json`，
同时通过 `protoBridge.shot` 保存截图。`npm run probe`（环境探测）可复核 API 可用性。
main.js 保留原有的三个 Chromium 开关（`enable-blink-features=CanvasDrawElement`、
`enable-unsafe-webgpu`、`use-webgpu-adapter=vulkan`），**没有**添加 `enable-features=Vulkan`；
仅为 `shader-*` 模式另加了 `disable-background-timer-throttling` /
`disable-renderer-backgrounding` / `disable-backgrounding-occluded-windows`
（防窗口被遮挡时 rAF 被节流），以及 180 s 无结果的看门狗（失败时 `exit 2` 并打印原因）。

## 1. 实测环境

来源：`shader-capture-results.json.env`、`shader-anim-results.json.env`、main 进程控制台。

| 项 | 实测值 |
| --- | --- |
| Chromium | `156.0.8078.49`（Electron `45.1.0`） |
| WebGPU adapter | `google swiftshader`（main 进程 isolated-world 上报；`adapter.info` 返回 `{}`） |
| `getPreferredCanvasFormat()` | `rgba8unorm` |
| `canvas.content` | `"drawable"`，`layoutsubtree` 未设置 |
| `captureElementImage` / `requestPaint` / `updateElementGeometry` / `onpaint` | 全部存在 |
| `GPUQueue.drawElementImageToTexture` / `copyElementImageToTexture` | 全部存在 |
| WebGL2 | `WebGL 2.0 (OpenGL ES 3.0 Chromium)`，renderer `WebKit WebGL` |
| `maxTextureDimension2D` | 8192 |
| 窗口 CSS viewport | `1536x923`；`devicePixelRatio` 在多次运行间为 `1` 或 `1.6667`（见第 5 节） |
| rAF 空闲频率 | 约 120 Hz（p50 8.3–8.4 ms） |
| gpuErrors / page errors | `[]` / `[]`（最终两次运行均无错误） |

结论：**环境可以运行 Electron 与全部实验性 API**，本报告的数据是实际跑出来的，不是模拟。
唯一的环境限制是 WebGPU 走 SwiftShader **软件**适配器，第 5 节说明其对绝对 FPS 的影响。

## 2. 探针构造

Board 是 `<canvas content="drawable">` 的直接子节点（`<section drawable>`，`480x320`，白底），
内部包含：

- 标题文本、绿色纯色 div `#00ff00`（`x=20..460, y=70..94`），用作坐标校准标记；
- WebGL2 `<canvas>`（`210x150`，`x=20..230, y=110..260`），片元着色器输出
  `x < 0.5 + 0.35*sin(u_time) ? 红 : 蓝`；`u_time=0` 时左半纯红、右半纯蓝；
- 2D `<canvas>`（`210x150`，`x=250..460, y=110..260`），左半 `#ffff00`、右半 `#00ffff`。

断言采样点（board 局部坐标）：`dom=(240,82)`、`glLeft=(72,185)`、`glRight=(178,185)`、
`twoLeft=(302,185)`、`twoRight=(408,185)`。因为 `captureElementImage` 的固有尺寸含
visual overflow 且随 DPR 变化（实测 `480x342.56` 或 `800x570.81`），所有采样都先通过
绿色 div 的实际像素包围盒做仿射校准（`analyze.calibration`），再取点；另外对整张纹理做
全图颜色直方图（`colorHits`），因此「没有找到红/蓝/黄/青」不可能是坐标错位造成的。

WebGL 变体：`preserveDrawingBuffer:false/true` × `alpha:true/false` 共 4 组，
加上「嵌套 canvas 带 `drawable` 属性」和「无 WebGL 的纯 DOM+2D 对照组」，共 6 块 board。
每块 board 分别走 4 条捕获路径：

1. `GPUQueue.drawElementImageToTexture({source: boardEl}, {texture, size})`
2. `GPUQueue.copyElementImageToTexture({source: boardEl}, {destination:{texture}})`
3. `canvas.captureElementImage(boardEl)` → `copyElementImageToTexture({source: ElementImage}, …)`
4. `canvas.captureElementImage(boardEl)` → `drawElementImageToTexture({source: ElementImage}, …)`

读回统一用 `copyTextureToBuffer` + `mapAsync`，纹理格式 `rgba8unorm`。

## 3. 问题 1：嵌套 WebGL2 canvas 在 element-image 捕获下是否保留内容？

### 3.1 原始像素（实测）

WebGL 源缓冲（`gl.readPixels`，绘制后立即读）与 2D 源画布（`getImageData`）在所有 board 上
都是正确内容：

```
sourceAtCreation.glLeft  = [255, 0, 0, 255]      sourceAtCreation.glRight = [0, 0, 255, 255]
sourceAtCreation.twoLeft = [255, 255, 0, 255]    sourceAtCreation.twoRight= [0, 255, 255, 255]
sourceAtCapture.glLeft   = [255, 0, 0, 255]      sourceAtCapture.glRight  = [0, 0, 255, 255]
```

捕获结果（6 块 board 全部一致，以下为 `gl-default` 的 `drawElementImageToTexture` 读回值，
`480x320`，校准 scale `[1, 0.958]`）：

```
samples.dom      = [0, 255, 0, 255]        matches.dom      = true
samples.glLeft   = [255, 255, 255, 255]   matches.glLeft   = false
samples.glRight  = [255, 255, 255, 255]   matches.glRight  = false
samples.twoLeft  = [255, 255, 255, 255]   matches.twoLeft  = false
samples.twoRight = [255, 255, 255, 255]   matches.twoRight = false
colorHits        = {red: 0, blue: 0, yellow: 0, cyan: 0, green: 2420}
opaquePercent    = 100
```

`copyElementImageToTexture({source: boardEl})` 得到完全相同的 samples 与
`{red:0, blue:0, yellow:0, cyan:0}`；`captureElementImage → copyElementImageToTexture`
（`800x571` 纹理）与 `captureElementImage → drawElementImageToTexture` 也是
`{red:0, blue:0, yellow:0, cyan:0, green:7707}`。截图
`shots/shader-capture-composited.png` 显示 6 块 board 只有文本 + 绿色条，
两个 canvas 区域全是白底。

### 3.2 逐项回答

| 子问题 | 实测答案 |
| --- | --- |
| WebGL2 canvas 内容是否出现在捕获结果？ | **否**。两种 API、4 条路径、全图直方图都是 0 个红/蓝像素；区域是 board 的白底（非黑、非透明空白，而是父背景透出）。 |
| 2D canvas 对照组是否正常？ | **也不正常**：黄/青命中数 0。`getImageData` 证明 2D 缓冲本身有内容，只是没进入 element-image。这说明问题不是 WebGL 特有，而是**嵌套 `<canvas>` 元素特有**。普通 DOM 文本/纯色 div 正常。 |
| 两种捕获 API 行为是否一致？ | **一致**。`drawElementImageToTexture`、`copyElementImageToTexture`（源为 Element 或 ElementImage）、`captureElementImage` 都一致地丢弃嵌套 canvas 内容；`gpuErrors` 为空，不是报错静默失败。 |
| `preserveDrawingBuffer:false` vs `true`？ | **无差别**，两组结果完全相同。另做了「每帧重绘 WebGL（连续 6+ 帧）后再捕获」的 redraw 阶段：`glSourceDuringRedraw` 仍是 `[255,0,0]`/`[0,0,255]`，捕获仍是 `red:0, blue:0`。 |
| WebGL `alpha` 选项是否有影响？ | **无差别**，`alpha:false/true` 各组合结果相同。 |
| 其他尝试过但无效的开关 | 嵌套 canvas 加 `drawable` 属性：无效；host canvas 加 `layoutsubtree=""`：无效；每帧 `updateElementGeometry`：见下。 |

### 3.3 定位原因的额外实测（`nestedDiagnostics`）

| 实验 | 实测结果 |
| --- | --- |
| 嵌套 canvas 的布局 | `getBoundingClientRect()` = `{x:20,y:110,w:210,h:150}`，`display:block`、`visibility:visible`、`offsetW/H=210/150`。**已正常布局，不是尺寸为 0**。 |
| 把嵌套 canvas 本身作为捕获根 | `drawElementImageToTexture` 抛 `TypeError: Only immediate children of the <canvas> element can be passed to drawElementImageToTexture().`；`captureElementImage` 抛 `InvalidStateError: The element can only be drawn into its nearest ancestor <canvas>.`；`updateElementGeometry` 抛同样的 InvalidStateError。**即「把 shader 节点单独抓一张纹理」在 board 内嵌布局下根本不被 API 允许**。 |
| 给嵌套 canvas 设 CSS 背景 `#ff00ff` | 捕获到 `magenta: 7800` 个采样像素（2D canvas 的采样点变成 `[255,0,255,255]`），红/蓝/黄/青仍为 0。**canvas 的盒子被栅格化了，只有它的绘制缓冲内容被排除**。 |
| 同位置放 `<img src="data:...">`（橙） | `orange: 7875`，**正常捕获**。 |
| 同位置放内联 `<svg><rect fill="#8000ff">`（紫） | `purple: 7875`，**正常捕获**。 |
| `ElementImage` 交给 2D `ctx.drawImage` | `TypeError: ... not of type '(CSSImageValue or HTMLCanvasElement or ... VideoFrame)'`。ElementImage 不是 `CanvasImageSource`，不能这样读回。 |
| `captureElementImage` 固有尺寸 | `800 x 570.813`（在 `dpr=1.6667` 的运行里）或 `480 x 342.562`（在 `dpr=1` 的运行里）；高度始终比 board 的 320 多约 22.56 px 的 visual overflow。 |

### 3.4 对照实验：shader canvas 作为 host canvas 的**直接子节点**（`topLevelShader`）

把同一块 WebGL2 canvas 直接挂到 `<canvas content="drawable">` 下（与 board 平级，带 `drawable`），
再捕获：

```
glSource.glLeft = [255,0,0,255]  glSource.glRight = [0,0,255,255]
drawElementImageToTexture(210x150): colorHits {red: 1440, blue: 1395, ...}, opaque 36%
captureElementImage: {width: 350, height: 267.571}
copyElementImageToTexture(350x268): colorHits {red: 4293, blue: 4212, ...}, opaque 35.8%
contentBounds (210x150 纹理) = [0, 0, 124, 88]
contentBounds (350x268 纹理) = [0, 0, 208, 158]
```

**实测：WebGL2 内容被完整捕获（红+蓝都在）**，但只占纹理约 36% 面积——
`captureElementImage` 的固有尺寸是 CSS 尺寸的 1.667 倍，而 WebGL 绘制缓冲按 1:1 物理像素
写入，因此内容落在左上角 `[0,0,208,158]`（350x268 纹理内）/ `[0,0,124,88]`（210x150 纹理内）。
[INFERENCE] 若采用此路线，需要把 WebGL canvas 的 `width/height` 按 `captureElementImage`
返回的尺寸（或 `devicePixelRatio`）设置，否则纹理右下部分是透明空白。

## 4. 问题 2：单个节点的 60fps 动画是否导致整块 board 每帧重传？

动画由 rAF 驱动（本机空闲 rAF ≈ 120 Hz，≥60fps），每帧调用 `gl.draw(u_time)`；
`paint` 事件里记录 `changedElements` 的 tag / 是否为 board / 是否为 shader canvas；
凡是 board 出现在 `changedElements` 就按真实合成器的方式上行一次
`drawElementImageToTexture`。两个计数通道互相校验：
`shader-anim-results.json.paintTotal == preload.counts().paintCount`（最终运行 835 / 835）。

### 4.1 原始数据（小 board `480x320`，每次上传 `480*320*4 = 614,400 B`）

| 场景 | 帧数 | FPS | paint 事件 | 含整块 board | 含 shader canvas | uploads | uploads/帧 | B/帧 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shader-static` | 300 | 120 | 0 | 0 | 0 | 0 | 0 | 0 |
| `shader-anim` | 215 | 71 | 214 | **214** | 0 | 214 | **1** | 611,542 |
| `shader-anim-preserve` | 194 | 77 | 193 | **193** | 0 | 193 | **1** | 611,233 |
| `dom-anim`（对照） | 301 | 120 | 25 | 25 | 0 | 25 | 0.1 | 51,030 |
| `geom-only`（对照） | 300 | 120 | 0 | 0 | 0 | 0 | 0 | 0 |

`shader-anim` 的 `paintRecords[0]`（实测原文）：

```json
{"n": 1, "board": true, "shaderCanvas": false, "drawableCount": 1,
 "tags": ["SECTION#anim-anim.board"]}
```

`changedCountsMax = 1`，`changedCountsSample = [1,1,1,...]`。

### 4.2 大 board（实测，`2000x1500`，含 24 个普通 DOM 节点，每次上传 `12,000,000 B`）

| 场景 | 帧数 | FPS | p50 | p99 | paint 事件 | 含整块 board | uploads | uploads/帧 | B/帧 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `large-shader-static` | 290 | 116 | 8.4 ms | 16.8 ms | 0 | 0 | 0 | 0 | 0 |
| `large-shader-anim` | 39 | **9** | **108.6 ms** | **133.5 ms** | 38 | **38** | 38 | **1** | **11,692,308** |

### 4.3 逐项回答

- **`changedElements` 是否每帧包含整个 board？** 是。实测 `214/215` 帧的 paint 事件都恰好
  包含 1 个元素，且是 `SECTION#...board`（整块 board），**从来不是 shader canvas 节点**
  （`shaderCanvas: 0`，`drawableCount: 1`）。大 board 同样 `38/38`。
- **每帧上传的字节量/次数**：小 board 每帧 1 次 / 614,400 B；大 board 每帧 1 次 /
  12,000,000 B，实测 9 FPS 时约 `11.7 MB/帧`、`≈105 MB/s`。`geom-only` 场景证明
  每帧 `updateElementGeometry` 本身不产生 paint 事件，所以这些重传完全由 shader 动画引起。
- **静止 vs 动画**：静止 0 次上传、0 次 paint（FPS 116–120）；动画 1 次/帧（FPS 71–77，
  大 board 9 FPS）。`dom-anim` 对照只产生 25 次 paint / 301 帧，说明 WebGL 每帧重绘比
  DOM 样式突变更「不可合并」。
- **即使整块 board 每帧重传，shader 内容依然看不到**：所有动画场景的
  `startPixels == endPixels`（`glLeft/glRight` 始终 `[255,255,255,255]`），
  `textureChanged: false`；而 `dom-anim` 的 `textureChanged: true`（绿条变色被上传），
  证明读回与上传链路是有效的。这与问题 1 的结论一致：**重传的是不含 shader 内容的整块快照**。

### 4.4 替代路线的动画实测（`top-level-shader-anim`）

把 shader canvas 作为 host canvas 的直接子节点、与一块静态 board 平级，
shader 每帧动画，board 不动：

| 指标 | 实测 |
| --- | --- |
| paint 事件 | 350 / 350 帧，每帧 `changedElements = ["CANVAS#top-shader"]` |
| 含整块 board 的 paint | **0** |
| `boardUploads` | **0** |
| `shaderUploads` | 350（1/帧），`210*150*4 = 126,000 B/次` |
| `bytesPerFrame` | **126,000**（对比大 board 内嵌方案的 11,692,308） |
| FPS | 117（另一轮运行为 78，见第 5 节） |
| `glDraws` | 351 |

即采用「shader 节点作为顶层可绘制元素」时，动画只让 shader 自己的小纹理每帧重传，
**整块 board 完全不重传**。

## 5. 实测的环境波动与限制（影响绝对数值，不影响结论）

- **WebGPU 是 SwiftShader 软件适配器**：`large-shader-anim` 的 9 FPS 与 `≈11.7 MB/帧`
  是软件光栅 + 12 MB/帧拷贝的结果。[INFERENCE] 在真实 Vulkan/硬件 GPU 上绝对 FPS 会更高，
  但「动画 → 每帧 12 MB 整板重传」这一结构性开销不依赖适配器。
- **rAF 频率约 120 Hz 且随运行波动**：静止场景 116–120 FPS，动画场景 71–78 FPS；
  另一次运行中 `top-level-shader-anim` 为 78 FPS、内嵌 `shader-anim` 为 74 FPS。
  本报告表格取最终一次运行值。[INFERENCE] 窗口遮挡/其他 GPU 进程竞争会造成 rAF 节流，
  因此 FPS 只用于同一次运行内的相对比较。
- **`devicePixelRatio` 在启动瞬间不稳定**（实测 `1` 与 `1.6667` 都出现过），
  直接导致 `captureElementImage` 的固有尺寸为 `480x342.56` 或 `800x570.81`；
  探针已用绿色标记做像素级校准消除影响。
- **一次重跑失败（原文）**：`[513633:1104/200231.501391:ERROR:content/browser/gpu/gpu_process_host.cc:1038] GPU process launch failed: error_code=1002`、
  `FATAL:content/browser/gpu/gpu_data_manager_impl_private.cc:389] GPU process isn't usable. Goodbye.`；
  同一时段另一次 capture 重跑因 rAF 被节流而超过 280 s 超时（只打印到
  `[proto] window created, mode=shader-capture` 和几条 Canvas2D 警告，没有 `RESULTS written`）。
  这两次都没有写结果文件，本报告数据来自此前完整的成功运行。为此加了上面的防节流开关与
  180 s 看门狗。[INFERENCE] 失败由同机多个 Electron/GPU 进程竞争或窗口遮挡引起，不是探针逻辑错误。
- **[INFERENCE]** 本报告只覆盖 Electron 45.1.0 / Chromium 156 + SwiftShader 这一组合；
  CanvasDrawElement 是实验性 API，Chromium 版本升级后行为可能变化，需要在目标版本上重跑本探针。

## 6. 明确判定

**判定：不能把 shader 节点放进 board DOM 内被一起捕获。**

理由（全部为实测）：

1. 嵌套 WebGL2 canvas 的内容在 `captureElementImage` 与 `drawElementImageToTexture`
   下都完全丢失；2D canvas 同样丢失，普通 DOM / `<img>` / 内联 `<svg>` 正常。
2. 所有能想到的救急开关都无效：`preserveDrawingBuffer`、`alpha`、每帧重绘、
   嵌套 `drawable` 属性、host `layoutsubtree`、每帧 `updateElementGeometry`。
3. API 明确禁止把「孙级」canvas 当作独立捕获根，因此也无法在 board 内部单独抓 shader 纹理。
4. 更糟的是：shader 动画仍会让整块 board 每帧进入 `changedElements` 并触发整板重传
   （大 board 12 MB/帧、9 FPS），而重传后的纹理里**依然没有 shader 内容** —— 付出全部带宽
   却拿不到画面。

**推荐技术路线（有实测支撑）**：把 shader 节点做成 host `<canvas content="drawable">` 的
**直接子 `drawable` 元素**，与 board 平级，作为独立纹理/quad 由 WebGPU 合成器按画布相机
叠加；shader 动画时 `changedElements` 只含该 canvas，实测 `boardUploads = 0`、
`126,000 B/帧`，且 `drawElementImageToTexture` / `captureElementImage` 都能拿到 WebGL2 内容。
[INFERENCE] 需要处理 DPR：`captureElementImage` 的固有尺寸是 CSS 尺寸的 ~1.667 倍，
WebGL 绘制缓冲要按该比例设置，否则纹理右下留透明; 另外要自行实现 shader quad 与 board
quad 的 z 序/裁剪以及命中测试，因为 shader 节点不再位于 board 的 DOM 子树内。

## 7. 新增/修改的文件（全部在 `prototype/` 内）

| 文件 | 说明 |
| --- | --- |
| `prototype/shader.html`（新增） | 两个探针模式共用的页面（`content="drawable"` host canvas + HUD） |
| `prototype/shader-probe.js`（新增） | 全部探针逻辑：board 构造、WebGL2/2D 源、4 条捕获路径、像素读回与校准、paint/上传计数、FPS、替代路线对照 |
| `prototype/main.js`（修改） | 新增 `shader-*` 的 `PROTO_MODE` 分支、`shader.html` 加载、模式专属 `out/<mode>-results.json` 与结果日志 |
| `prototype/preload.js`（修改） | 暴露 `protoBridge.counts()` 作为 isolated-world 绘制计数交叉校验 |
| `prototype/package.json`（修改） | 新增 `shader:capture` / `shader:anim` / `shader:all` 脚本 |
| `prototype/SHADER_PROBE_REPORT.md`（新增） | 本报告 |
| `prototype/out/shader-capture-results.json` 等（生成） | 原始结果 JSON 与截图 |

`apps/`、`packages/` 下没有任何文件被修改；没有 git 提交；新增代码中没有注释。
