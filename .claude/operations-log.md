** 编码前检查 - Hermes 检测安装逻辑
时间：2026-05-09 11:03:23 +08:00

□ 已查阅上下文摘要文件：.claude/context-summary-hermes-detect-install.md
□ 将使用以下可复用组件：
  - detectHermesStatus: internal/handler/hermes.go - 统一生成 Hermes 安装与运行状态
  - hermesHomeDir: internal/handler/hermes.go - 根据配置和环境推导 Hermes home
  - config.BuildExecEnv: internal/config/runtime_env.go - 为命令检测提供增强 HOME/PATH
□ 将遵循命名约定：Go 函数驼峰命名，测试使用 Test 前缀
□ 将遵循代码风格：gofmt 格式化，保持小范围修改
□ 确认不重复造轮子，证明：检查了 internal/handler/hermes.go、internal/handler/software.go、internal/taskman/taskman.go

** 编码后声明 - Hermes 检测安装逻辑
时间：2026-05-09 11:03:23 +08:00

# 1. 复用了以下既有组件
detectHermesStatus: 用于软件列表检测，位于 internal/handler/hermes.go
config.BuildExecEnv: 间接用于检测命令与安装脚本执行环境，位于 internal/config/runtime_env.go

# 2. 遵循了以下项目约定
命名约定：新增测试使用 TestHermesInstallScriptUsesRuntimeHomeFallback 与 TestSoftwareListPassesConfigToHermesDetection。
代码风格：已执行 gofmt。
文件组织：检测入口仍保留在 software.go，Hermes 状态逻辑仍保留在 hermes.go。

# 3. 对比了以下相似实现
internal/handler/hermes.go:450: 本次让软件列表传入 cfg，保持 Hermes home 推导一致。
internal/handler/hermes.go:2190: 本次让安装脚本 HOME 回退策略与动作脚本一致。
internal/taskman/taskman.go:219: 安装脚本继续通过既有 taskman 环境执行。

# 4. 未重复造轮子的证明
检查了 internal/handler/hermes.go、internal/handler/software.go、internal/config/runtime_env.go，确认已有检测与环境增强能力可复用。

# 5. 工具限制记录
sequential-thinking、shrimp-task-manager、desktop-commander、context7、github.search_code 在当前工具集不可用；已用本地 `rg`、Git、Go 测试做替代验证。

** 编码后声明 - Hermes 消息渠道批准动作
时间：2026-05-09 11:03:23 +08:00

# 1. 复用了以下既有组件
hermesActionCatalog: 用于在动作页暴露新卡片，位于 internal/handler/hermes.go。
buildHermesActionScript: 用于生成后台任务脚本，位于 internal/handler/hermes.go。
api.runHermesAction: 用于前端提交动作，位于 web/src/lib/api.ts。

# 2. 遵循了以下项目约定
命名约定：后端动作 ID 使用 kebab-case，任务类型继续使用 `hermes_` 前缀。
代码风格：Go 文件已执行 gofmt，前端沿用现有卡片和任务列表结构。
文件组织：后端白名单、前端页面和 mock API 分别在原有文件中扩展。

# 3. 对比了以下相似实现
internal/handler/hermes.go:2183: 新动作沿用现有动作目录模式。
web/src/pages/HermesActions.tsx:34: 新卡片沿用动作页加载、提交、刷新任务的模式。
web/src/pages/HermesPlatforms.tsx:704: API 保持旧调用方式兼容。

# 4. 未重复造轮子的证明
检查了 Hermes 动作页、Hermes 后端动作白名单、mock API 与平台页调用点，确认已有动作执行链路可直接扩展。

** 编码前检查 - Hermes 配置页模型下拉
时间：2026-05-09 12:15:51 +08:00

□ 已查阅上下文摘要文件：`.claude/context-summary-hermes-config-model.md`
□ 将使用以下可复用组件：
  - `api.getModels`: `web/src/lib/api.ts` - 读取 OpenClaw 模型提供商
  - `api.fetchModelList`: `web/src/lib/api.ts` - 复用 OpenClaw 模型拉取接口
  - `api.updateHermesStructuredConfig`: `web/src/lib/api.ts` - 保存 Hermes 结构化配置
□ 将遵循命名约定：React 组件 PascalCase，状态与工具函数 camelCase，配置字段沿用 Hermes/OpenClaw 既有 key。
□ 将遵循代码风格：TypeScript 函数组件、Tailwind 卡片样式、局部 state 驱动交互。
□ 确认不重复造轮子，证明：检查了 `HermesConfig.tsx`、`SystemConfig.tsx`、`api.ts`、`mockApi.ts`，模型拉取能力已有实现。

** 编码后声明 - Hermes 配置页模型下拉
时间：2026-05-09 12:15:51 +08:00

# 1. 复用了以下既有组件
`api.getModels`: 用于读取 OpenClaw 模型提供商，位于 `web/src/lib/api.ts`。
`api.fetchModelList`: 用于按 Base URL 与 API Key 拉取模型列表，位于 `web/src/lib/api.ts`。
`api.updateHermesStructuredConfig`: 用于保存 Hermes 配置，位于 `web/src/lib/api.ts`。

# 2. 遵循了以下项目约定
命名约定：新增 `normalizeProviderModels`、`inferProviderId`、`fetchProviderModels`，与现有页面工具函数风格一致。
代码风格：继续使用现有现代卡片、按钮、表单控件 Tailwind 类名。
文件组织：变更集中在 `web/src/pages/HermesConfig.tsx`，没有新增无关模块。

# 3. 对比了以下相似实现
`web/src/pages/SystemConfig.tsx`: 本次复用其模型拉取交互思路，但不写回 OpenClaw 配置。
`web/src/pages/HermesConfig.tsx`: 保留结构化配置保存链路，屏蔽配置路径卡片和 `model` JSON 高级块。
`web/src/lib/mockApi.ts`: 复用已有 mock 模型列表返回，未新增重复 mock 端点。

# 4. 未重复造轮子的证明
检查了 `web/src/pages/SystemConfig.tsx`、`web/src/lib/api.ts`、`web/src/lib/mockApi.ts`，确认已有 OpenClaw 模型拉取与模型源读取能力，本次仅在 Hermes 配置页集成。

** 编码后声明 - Hermes配置模型卡片调整
时间：2026-05-09 13:43:31

# 1. 复用了以下既有组件
web/src/pages/SystemConfig.tsx：用于复用 API2CN 模型提供商卡片布局和字段行为。
web/src/lib/api.ts：用于复用模型列表拉取和 Hermes 结构化配置保存接口。

# 2. 遵循了以下项目约定
命名约定：常量使用 API2CN_*，页面状态使用 camelCase。
代码风格：React 函数组件、受控表单、Tailwind 样式。
文件组织：仅修改 Hermes 配置页，没有新增无关模块。

# 3. 对比了以下相似实现
SystemConfig 模型配置：Hermes 页面保留同类卡片样式，但固定 API2CN Base URL 和 Headers。
HermesConfig 原实现：保留刷新、保存、拉取模型、选择模型流程，删除多余运行配置卡片。
api.ts 封装：继续调用现有接口，未新增自研网络层。

# 4. 未重复造轮子的证明
检查了 web/src/pages/SystemConfig.tsx、web/src/lib/api.ts、web/src/pages/HermesConfig.tsx，确认可复用现有模型列表接口和结构化配置接口。

** 编码后声明 - Hermes菜单与API2CN余额域名调整
时间：2026-05-09 13:55:42

# 1. 复用了以下既有组件
web/src/components/Layout.tsx：复用 Hermes 侧边栏导航数组，仅调整健康项顺序。
internal/handler/ai.go：复用 fixedDefaultProviderRootURL 作为 API2CN 余额接口基础域名。

# 2. 验证结果
- npm run build：通过。
- go test ./internal/handler -run TestSoftwareListPassesConfigToHermesDetection -count=1：通过。
- go test ./internal/handler -count=1：失败，原因是 Windows 当前进程无创建符号链接权限，失败用例为 TestDetectBundledExtensionsDirFromResolvedPackageRoot，非本次改动引入。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：11552。

** 编码后声明 - 移除Hermes概览运行信息和管理入口卡片
时间：2026-05-09 14:01:11

# 1. 复用了以下既有组件
web/src/pages/HermesOverview.tsx：沿用现有概览页布局，仅移除指定双卡片区块。

# 2. 遵循了以下项目约定
命名约定：未新增命名实体。
代码风格：保持 React 函数组件和 Tailwind 样式结构。
文件组织：仅修改 HermesOverview 页面。

# 3. 验证结果
- npm run build：通过。
- 页面源码检索：当前运行时信息、管理入口、Runtime Details、Management Links 均已移除。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：23116。

** 编码后声明 - Hermes动作卡片迁入概览
时间：2026-05-09 14:08:11

# 1. 复用了以下既有组件
web/src/pages/HermesOverview.tsx：复用概览统计卡布局，在其下方新增动作卡片和最近动作任务面板。
web/src/lib/api.ts：复用 getHermesActions、getHermesTasks、runHermesAction 接口。
web/src/pages/HermesActions.tsx：复用动作卡片、CLI 预览、任务状态徽标和最近任务交互模式。

# 2. 遵循了以下项目约定
命名约定：HermesAction、HermesTask 类型沿用动作页结构。
代码风格：保持 React 受控状态、Tailwind 样式和现有 modern 分支样式。
文件组织：仅在概览页承接卡片，不新增重复 API 封装。

# 3. 验证结果
- npm run build：通过。
- 源码检索：动作接口、CLI 命令预览、最近动作任务均已位于 HermesOverview。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：16788。

** 编码后声明 - 隐藏Hermes动作菜单
时间：2026-05-09 14:13:18

# 1. 复用了以下既有组件
web/src/components/Layout.tsx：仅调整 Hermes 侧边栏导航数组。

# 2. 验证结果
- npm run build：通过。
- Hermes 侧边栏导航数组已无 /hermes/actions 菜单项。
- /hermes/actions 路由保留，概览内动作执行不受影响。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：25688。

** 编码后声明 - Hermes菜单文案调整
时间：2026-05-09 14:16:07

# 1. 复用了以下既有组件
web/src/components/Layout.tsx：仅调整 Hermes 侧边栏中文菜单文案。

# 2. 验证结果
- npm run build：通过。
- 通道管理/模型配置菜单文案源码检查：通过。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：21780。

** 编码后声明 - Hermes概览动作卡片延迟原因与修复
时间：2026-05-09 14:29:04

# 1. 原因定位
动作卡片数据来自 /api/hermes/actions 和 /api/hermes/tasks，实测分别约 20ms 和 18ms。
原实现把 actions/tasks 与 /api/hermes/overview 放在同一个 Promise.all 中，overview 实测约 794ms，导致动作卡片必须等慢接口完成才渲染。
后端 overview 会执行 Hermes 状态探测、配置解析和 Python/Hermes 命令检测，天然比静态动作目录慢。

# 2. 修复方式
web/src/pages/HermesOverview.tsx：新增 loadActionData，单独加载动作和任务。
web/src/pages/HermesOverview.tsx：loadStatus 只负责概览状态，不再阻塞动作卡片渲染。
web/src/pages/HermesOverview.tsx：任务轮询改为只刷新动作任务数据，避免每 2.5 秒重复拉取慢 overview。

# 3. 验证结果
- npm run build：通过。
- /api/hermes/actions：20ms。
- /api/hermes/tasks：18ms。
- /api/hermes/overview：794ms。
- 本地服务：http://127.0.0.1:19527，HTTP 200，监听 PID：8040。

## 编码前检查 - 一键源码安装脚本
时间：2026-05-09 14:35:29

- 已查阅上下文摘要文件：.claude/context-summary-install-source.md
- 将复用 scripts/install.sh 的安装目录、服务注册、环境变量和输出习惯。
- 将复用 scripts/install-local-pro.sh 的平台识别与本地安装定位思路。
- 将遵循 Makefile 的前端构建、embed 复制和 Go ldflags 约定。
- 确认不重复造轮子：保留 Release 安装脚本，新建源码安装入口解决“当前项目改动一键部署”场景。
- sequential-thinking、shrimp-task-manager、desktop-commander 当前环境不可用，使用本地检索与计划工具替代，并记录原因。

## 编码后声明 - 一键源码安装脚本
时间：2026-05-09 14:41:04

### 1. 复用了以下既有组件
- scripts/install.sh：复用安装目录、服务注册、CLAWPANEL_DATA 环境变量、防火墙放行和完成提示模式。
- scripts/install-local-pro.sh：复用平台识别和本地构建产物安装入口思路。
- Makefile：复用前端构建、embed 目录同步、Go ldflags 和 pro edition 构建约定。
- internal/config/config.go：复用 clawpanel.json 字段和环境变量覆盖协议。

### 2. 遵循了以下项目约定
- 命名约定：脚本文件沿用 scripts/install-*.sh。
- 代码风格：Bash 函数拆分、set -Eeuo pipefail、步骤式输出。
- 文件组织：新增脚本放入 scripts/，任务记录放入 .claude/。

### 3. 对比了以下相似实现
- scripts/install.sh：新脚本不下载 Release，而是源码构建后进入相同安装服务流程。
- scripts/install-local-pro.sh：新脚本不要求预先存在二进制，而是自动生成二进制。
- Makefile：新脚本内联相同构建步骤，便于远程管道安装时不依赖 make。

### 4. 未重复造轮子的证明
- 保留 Release 安装脚本，不改已有安装路径。
- 新脚本只覆盖“当前项目源码一键构建并安装”的缺口。

### 5. 验证结果
- C:\Program Files\Git\bin\bash.exe -n scripts/install-source.sh：通过。
- 关键结构检查：通过，覆盖 clone、前端构建、embed 同步、Go 构建、systemd/launchd、配置写入。
- shellcheck：本机未安装，已记录为工具缺失，使用 Bash 语法校验和结构检查替代。

** 编码后声明 - openclaw-dashboard-hide
时间：2026-05-09 17:34:55

# 1. 复用了以下既有组件
web/src/components/Layout.tsx: 复用既有导航数组控制菜单展示。
web/src/pages/Dashboard.tsx: 复用既有页面结构删除目标卡片渲染。

# 2. 遵循了以下项目约定
命名约定：未新增命名实体。
代码风格：沿用现有 React 函数组件与 Tailwind 写法。
文件组织：仅修改现有布局与页面文件。

# 3. 对比了以下相似实现
openClawNavItems: 菜单显示由数组项决定，本次确认活动日志与编排监控不在侧栏数组。
commandItems: 搜索入口由 path 命令项决定，本次移除 /logs 与 /monitor。
DashboardPage: 卡片为 JSX 区块渲染，本次删除最新活动区块并保留统计数据依赖。

# 4. 未重复造轮子的证明
检查了 web/src/components/Layout.tsx 与 web/src/pages/Dashboard.tsx，需求可通过现有声明式渲染入口完成，无需新增组件或工具。
