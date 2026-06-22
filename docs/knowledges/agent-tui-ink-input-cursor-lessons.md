# Lesson Learned: Ink TUI InputBar Cursor 与多行输入

日期：2026-06-22

适用范围：`@myz/agent-tui`、Ink 7、React 19、终端多行输入 / IME composing buffer / paste 输入。

## 背景

`packages/agent-tui` 使用 Ink 实现 `myz-agent` 的 TUI。原始问题集中在输入区：

1. `InputBar` 显示在状态栏下面。
2. 真实终端输入 buffer / IME composing buffer 不在视觉 `InputBar` 上。
3. 输入换行后，buffer 停留在 `InputBar` 首行，继续输入时横向偏移越来越大。
4. paste 多行文本后，视觉文本已经换行，但真实 cursor 仍按单行计算。

这类问题不是单纯的 CSS/Yoga 布局问题，而是 Ink 渲染模型、终端 cursor 控制、输入文本模型三者不一致导致的。

## 关键结论

### 1. `useCursor()` 坐标是整个 Ink frame 的绝对坐标

Ink 的 `useCursor().setCursorPosition({ x, y })` 不是相对当前组件的坐标，而是相对整个 Ink 输出区域的坐标。

因此 `InputBar` 内部不能只计算局部列号，必须：

- 用 `ref` + `useBoxMetrics()` 确认组件已经完成布局；
- 沿 Ink DOM `parentNode` + `yogaNode.getComputedLeft/Top()` 累加得到组件绝对位置；
- 再加上输入内容内部的 row/col。

相关实现：`packages/agent-tui/src/InputBar.tsx` 的 `getAbsolutePosition()`。

### 2. 不要用 Ink 自动 wrap 驱动输入模型

`<Text wrap="wrap">` / `<Text wrap="hard">` 只适合显示文本，不适合作为交互输入的真实文本模型。

原因：

- Ink/Yoga 会根据当前内容重新测量宽度；
- Text 节点之间的 flex 布局会影响换行；
- fake cursor（例如反色空格）会参与布局，接近行尾时会把行撑坏；
- `\n` 会被 Ink 渲染层处理，但 cursor 计算层如果不知道 `\n`，就会发生视觉行与真实 cursor 行不一致。

最终方案：输入组件必须自己维护 wrapping model。

### 3. 输入 wrapping 必须同时支持软换行和硬换行

只按终端宽度切行不够。paste 多行文本时会出现真实换行符：

- `\n`
- `\r\n`

如果 wrapping model 不处理这些硬换行，视觉层会换行，但 cursor 仍然停留在首行。

最终实现：

- `__wrapInputForTest(value, width)` 负责把输入切为 `WrappedLine[]`；
- 每个 `WrappedLine` 记录：
  - `text`
  - `start`
  - `end`
  - `width`
- 遇到 `\n` / `\r\n` 时立即 push 当前行，并把下一行 `start` 设置到换行符之后。

### 4. 宽度应使用终端列宽，不应使用当前内容测量宽度

曾经使用 `useBoxMetrics(inputRef).width` 作为输入宽度，导致普通文本被过早断行。

原因：该 width 可能受当前内容布局结果影响，不能作为稳定输入 viewport 宽度。

最终方案：

```ts
const { columns } = useWindowSize()
const textWidth = Math.max(1, columns - promptWidth)
```

`useBoxMetrics()` 只用于判断布局是否完成和计算绝对位置，不用于断行宽度。

### 5. 不要渲染 fake cursor

反色 fake cursor 看起来直观，但会参与 Ink/Yoga 布局，尤其在行尾和多行输入场景下会改变实际布局。

最终方案：

- 不渲染 fake cursor；
- 完全依赖真实终端 cursor；
- placeholder 只在空输入时显示。

### 6. 避免 Ink fullscreen 输出模式影响 cursor

`AgentShell` 如果使用 `height={rows}` 填满终端高度，Ink 会进入 fullscreen 输出路径；该路径下 cursor suffix 与 trailing newline 行为更容易产生 off-by-one。

最终方案：

```ts
const frameHeight = Math.max(1, rows - 1)
```

TUI 主 frame 少占一行，以换取稳定 cursor 行为。

## 本次代码改动摘要

### `packages/agent-tui/src/AgentShell.tsx`

- 引入 `useWindowSize()`。
- 将根容器设为固定高度：`height={Math.max(1, rows - 1)}`。
- 将布局顺序调整为：
  1. completed static history
  2. live streaming content area
  3. `InputBar`
  4. `StatusBar`
- `InputBar` 位于状态栏上方，状态栏保持底部。

### `packages/agent-tui/src/InputBar.tsx`

- 引入：
  - `useBoxMetrics`
  - `useCursor`
  - `useWindowSize`
  - Ink `DOMElement` type
- 新增 `getAbsolutePosition()`，计算组件在 Ink frame 中的绝对位置。
- 新增 wrapping model：
  - `WrappedLine`
  - `__wrapInputForTest()`
  - `__getCursorPositionForTest()`
- wrapping 支持：
  - CJK / emoji 等宽字符宽度：`string-width`
  - 软换行：按 `columns - promptWidth`
  - 硬换行：`\n` / `\r\n`
  - 行尾打满时创建空 continuation line 承载 cursor
- 输入区最多显示 `maxRows = 4` 行，超过后 viewport 跟随 cursor 滚动。
- 移除 fake cursor，仅使用真实 terminal cursor。
- 空行渲染一个空格，避免 Ink 折叠空行高度。

### `packages/agent-tui/tests/InputBar.test.ts`

新增回归测试：

1. paste 硬换行文本时，cursor row 必须落到真实行：

```ts
"First Line\nSecond Line\n第三行"
```

2. 软换行打满一行时，cursor 必须进入下一行。

## 验证命令

```bash
npm test --workspace @myz/agent-tui
npm exec --workspace packages/agent-tui tsc -- --noEmit
npm test --workspace myz-agent
npm run build --workspace myz-agent
```

## 后续实现准则

1. TUI 输入组件必须有独立文本模型，不允许依赖 Ink `<Text>` 自动 wrap 作为输入状态来源。
2. cursor 位置必须由同一个 wrapping model 计算，不允许视觉渲染一套、cursor 计算另一套。
3. 处理 paste 输入时必须覆盖 `\n` 和 `\r\n`。
4. 不允许 fake cursor 参与布局；cursor 必须由 `useCursor()` 控制。
5. 交互输入栏的宽度以 terminal columns 为准，不以当前内容测量结果为准。
6. 如果必须使用 fullscreen TUI，需要单独验证 Ink cursor suffix 的 off-by-one 行为；默认避免根容器填满全部 rows。

## 已知剩余现象

换行瞬间仍然存在轻微跳跃。这是 Ink 重新布局 + 终端 cursor 重新定位造成的视觉刷新抖动，目前不影响：

- 输入内容持久化；
- 多行 paste；
- cursor / IME buffer 跟随当前输入行；
- `InputBar` 与 `StatusBar` 的相对布局。
