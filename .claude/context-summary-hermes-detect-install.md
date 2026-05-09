** 项目上下文摘要（Hermes 检测安装逻辑）
生成时间：2026-05-09 11:03:23 +08:00

# 1. 相似实现分析
实现1: internal/handler/hermes.go:450
  - 模式：优先环境变量，再从配置派生用户目录，最后扫描常见 home。
  - 可复用：hermesHomeDir、detectHermesStatus。
  - 需注意：软件列表必须传入 cfg，否则无法复用配置派生路径。

实现2: internal/handler/hermes.go:517
  - 模式：先用 PATH 查找命令，再从 Hermes home 的父目录推导常见二进制位置。
  - 可复用：detectHermesBinaryPath、config.BuildExecEnv。
  - 需注意：服务环境下 PATH 不可靠，需要依赖增强环境与配置路径。

实现3: internal/handler/hermes.go:2190
  - 模式：Hermes 动作脚本统一设置 HOME 与 PATH，再执行 hermes 子命令。
  - 可复用：动作脚本中的 `${HOME:-$(cd ~ && pwd)}` 回退策略。
  - 需注意：安装脚本应与动作脚本保持一致，避免写入 root 目录。

# 2. 项目约定
命名约定：Go 后端使用驼峰函数名，测试使用 Test 前缀。
文件组织：Hermes 状态逻辑在 internal/handler/hermes.go，软件安装入口在 internal/handler/software.go。
导入顺序：标准库在前，项目内部包在后，由 gofmt 维护。
代码风格：制表符缩进，短函数和直接条件判断为主。

# 3. 可复用组件清单
`internal/handler/hermes.go`: detectHermesStatus、hermesHomeDir、detectHermesBinaryPath。
`internal/config/runtime_env.go`: BuildExecEnv 用于服务模式下增强 HOME/PATH。
`internal/taskman/taskman.go`: RunScript 使用统一命令环境执行安装脚本。

# 4. 测试策略
测试框架：Go testing。
测试模式：定向单元测试与已有 Hermes 行为测试。
参考文件：internal/handler/hermes_test.go、internal/handler/software_test.go。
覆盖要求：HOME 回退、配置传递、Hermes home 选择、进程检测。

# 5. 依赖和集成点
外部依赖：GitHub 官方 Hermes 安装脚本 URL。
内部依赖：GetSoftwareList、InstallSoftware、Hermes Overview 前端安装按钮。
集成方式：前端调用 `/software/install`，后端创建 taskman 后台任务。
配置来源：config.Config.OpenClawDir、HERMES_HOME、系统 HOME。

# 6. 技术选型理由
为什么用这个方案：复用既有 Hermes 检测函数与 taskman 环境构建，不新增安装框架。
优势：改动小，保持后端 API 契约不变。
劣势和风险：安装脚本仍依赖远端脚本可用性，未做端到端真实安装。

# 7. 关键风险点
并发问题：安装任务异步执行，状态刷新依赖前端再次拉取。
边界条件：服务模式 HOME 缺失、配置目录不在当前用户 home、PATH 未加载 `.local/bin`。
性能瓶颈：检测会调用命令和少量文件 stat，影响较低。
安全考虑：本次仅记录风险，不新增安全控制。

** 补充上下文（Hermes 消息渠道批准动作）
生成时间：2026-05-09 11:03:23 +08:00

# 1. 相似实现分析
实现1: web/src/pages/HermesActions.tsx:34
  - 模式：动作卡片由 `/hermes/actions` 返回的后端白名单驱动，前端统一触发 `api.runHermesAction`。
  - 可复用：现有动作卡片布局、任务刷新、CLI 命令预览。

实现2: internal/handler/hermes.go:2183
  - 模式：`hermesActionCatalog` 暴露动作清单，`buildHermesActionScript` 生成实际 CLI 脚本。
  - 可复用：Hermes 动作白名单、统一 HOME/PATH 脚本头。

实现3: web/src/pages/HermesPlatforms.tsx:704
  - 模式：平台页通过 `api.runHermesAction(action)` 触发 Hermes 后端动作。
  - 可复用：API 调用方式保持兼容，新增参数为可选字段。

# 2. 集成点
前端：web/src/pages/HermesActions.tsx 新增消息渠道批准卡片的输入、预览和提交。
API：web/src/lib/api.ts 的 `runHermesAction` 支持可选 `{ platform, pairingCode }`。
后端：internal/handler/hermes.go 新增 `pairing-approve` 动作，生成 `hermes pairing approve <platform> <code>`。

# 3. 验证策略
后端：新增脚本生成与输入拒绝测试。
前端：运行 `npm run build` 验证 TypeScript 与 Vite 构建。
