** 项目上下文摘要（Hermes配置模型卡片调整）
生成时间：2026-05-09 13:43:31

# 1. 相似实现分析
实现1: web/src/pages/SystemConfig.tsx:14
- 模式：API2CN 固定模型提供商，Base URL 与 User-Agent 使用常量。
- 可复用：固定默认服务商、只读 Base URL、只读 Headers、获取模型列表按钮。
- 需注意：后端模型列表接口当前按 /v1 模型端点请求。

实现2: web/src/pages/SystemConfig.tsx:1145
- 模式：API Key 使用受控 input，可直接输入并写回配置状态。
- 可复用：密码输入框、聚焦样式、保存前通过配置状态提交。
- 需注意：API Key 不能 readOnly，否则用户无法配置。

实现3: web/src/pages/HermesConfig.tsx:1
- 模式：Hermes 结构化配置通过 getHermesStructuredConfig/updateHermesStructuredConfig 读取和保存。
- 可复用：模型配置块、刷新/保存按钮、模型列表选择逻辑。
- 需注意：只隐藏 UI 卡片，不删除后端结构化配置能力。

# 2. 项目约定
命名约定：React 组件使用 PascalCase，状态和工具函数使用 camelCase，常量使用大写蛇形命名。
文件组织：页面组件位于 web/src/pages，API 封装位于 web/src/lib/api.ts。
导入顺序：React/路由、图标、项目 API、i18n。
代码风格：函数组件、Tailwind 类名、受控表单。

# 3. 可复用组件清单
web/src/pages/SystemConfig.tsx：API2CN 固定服务商模型配置样式。
web/src/lib/api.ts：getModels、fetchModelList、getHermesStructuredConfig、updateHermesStructuredConfig。
web/src/pages/HermesConfig.tsx：Hermes 配置页保存和加载入口。

# 4. 测试策略
测试框架：前端使用 TypeScript 构建与 Vite 打包验证。
测试模式：运行 npm run build 覆盖类型检查与生产构建。
参考文件：web/package.json。
覆盖要求：确认页面代码无类型错误，产物可嵌入后端。

# 5. 依赖和集成点
外部依赖：React、lucide-react、Vite。
内部依赖：api.getModels、api.fetchModelList、api.updateHermesStructuredConfig。
集成方式：HermesConfig 页面通过 API 拉取 OpenClaw 模型列表并保存 Hermes model 配置。
配置来源：Hermes structured config 与 OpenClaw models 配置。

# 6. 技术选型理由
为什么用这个方案：沿用 OpenClaw API2CN 卡片样式，但将 Hermes 页面收敛为单一模型配置入口。
优势：减少误操作面，Base URL 和 Headers 固定只读，API Key 可输入。
劣势和风险：后端模型列表接口仍使用 /v1 端点，UI 展示根地址。

# 7. 关键风险点
并发问题：无共享并发写入，仅保存按钮触发配置更新。
边界条件：API Key 为空时阻止拉取模型并提示。
性能瓶颈：模型列表仅用户点击时拉取。
安全考虑：本次不新增认证或加密逻辑，仅保持既有配置提交路径。
