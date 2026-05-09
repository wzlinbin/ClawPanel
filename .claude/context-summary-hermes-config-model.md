** 项目上下文摘要（Hermes 配置页模型下拉）
生成时间：2026-05-09 12:15:51 +08:00

# 1. 相似实现分析
**实现1**: `web/src/pages/HermesConfig.tsx`
- 模式：Hermes 配置页通过 `api.getHermesStructuredConfig()` 读取结构化配置，并用 `api.updateHermesStructuredConfig(config)` 保存。
- 可复用：`updateNested`、`updateBlock`、现代卡片样式、JSON 高级配置块。
- 需注意：原页面包含配置路径卡片和 `model` JSON 块，用户要求屏蔽路径卡片并改为模型下拉。

**实现2**: `web/src/pages/SystemConfig.tsx`
- 模式：OpenClaw 模型配置通过 `api.fetchModelList()` 拉取模型列表，再把模型列表写入 provider 的 `models`。
- 可复用：模型拉取按钮、加载状态、结果提示、模型列表去重。
- 需注意：该页面使用固定默认 Base URL；Hermes 配置页需要优先使用已选 OpenClaw provider 的 Base URL。

**实现3**: `web/src/lib/api.ts`
- 模式：前端 API 封装已有 `getModels()`、`fetchModelList(baseUrl, apiKey)`。
- 可复用：无需新增后端接口，Hermes 可直接复用 OpenClaw 模型提供商与模型拉取接口。
- 需注意：Hermes 保存仍走 Hermes 结构化配置接口，不能把 Hermes 配置写回 OpenClaw 配置。

**实现4**: `web/src/lib/mockApi.ts`
- 模式：mock API 已提供 `getModels()` 和 `fetchModelList()`，可支撑本地构建与模拟页面交互。
- 可复用：不需要新增 mock 端点。
- 需注意：mock 返回模型是字符串数组，真实配置中 provider models 可能是字符串或对象。

# 2. 项目约定
**命名约定**: React 组件使用 PascalCase，状态变量使用 camelCase，配置字段保留后端已有 key。
**文件组织**: 页面组件位于 `web/src/pages`，API 封装位于 `web/src/lib/api.ts`。
**导入顺序**: React 与路由导入在前，图标与内部模块随后。
**代码风格**: TypeScript 函数组件，Tailwind 类名沿用现有卡片样式。

# 3. 可复用组件清单
`web/src/lib/api.ts`: `getModels()` 用于读取 OpenClaw 模型提供商。
`web/src/lib/api.ts`: `fetchModelList(baseUrl, apiKey)` 用于拉取模型列表。
`web/src/lib/api.ts`: `getHermesStructuredConfig()` 与 `updateHermesStructuredConfig()` 用于读写 Hermes 配置。
`web/src/pages/SystemConfig.tsx`: `fetchProviderModels` 模式用于参考加载状态、错误提示和模型去重。

# 4. 测试策略
**测试框架**: 前端当前以 TypeScript 构建与 Vite 打包作为可重复验证。
**测试模式**: 执行 `npm run build`，覆盖类型检查和生产构建。
**参考文件**: `web/src/pages/SystemConfig.tsx` 的模型拉取逻辑。
**覆盖要求**: 路径卡片不再渲染；模型配置可从 OpenClaw provider 拉取模型并下拉选择；构建通过。

# 5. 依赖和集成点
**外部依赖**: React、lucide-react、Vite、TypeScript。
**内部依赖**: `api.getModels()`、`api.fetchModelList()`、Hermes 结构化配置接口。
**集成方式**: Hermes 配置页本地 state 合并 OpenClaw 模型提供商数据，保存时仍提交 Hermes 配置。
**配置来源**: OpenClaw 模型提供商来自 `/openclaw/models`，Hermes 配置来自 Hermes structured config。

# 6. 技术选型理由
**为什么用这个方案**: 用户要求参考 OpenClaw，现有前端 API 已有模型源读取和模型拉取接口，直接复用可减少新增后端与重复实现。
**优势**: 变更集中在配置页，接口复用，模型选择从自由输入变为下拉选择。
**劣势和风险**: Hermes 的 `model.provider` 与 OpenClaw provider id 不是同一概念，因此页面使用独立 provider 下拉推导 `base_url`，不强行覆盖 Hermes provider。

# 7. 关键风险点
**并发问题**: 模型拉取过程中仅更新本地 OpenClaw provider 列表，不会产生跨页写回冲突。
**边界条件**: provider 为空、Base URL 为空、拉取失败、已有模型不在拉取列表中均有 UI 兜底。
**性能瓶颈**: 模型拉取是用户手动触发，不增加页面初始阻塞 I/O。
**安全考虑**: 本次不新增认证、鉴权或敏感信息展示逻辑，仅复用既有 API Key 配置。
