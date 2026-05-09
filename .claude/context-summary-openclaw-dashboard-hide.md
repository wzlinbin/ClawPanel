** 项目上下文摘要（openclaw-dashboard-hide）
生成时间：2026-05-09 17:34:55

# 1. 相似实现分析
实现1: web/src/components/Layout.tsx:307
  - 模式：OpenClaw 侧栏菜单由 openClawNavItems 数组集中声明。
  - 可复用：通过移除数组项隐藏侧栏入口。
  - 需注意：路由仍可存在，本次只隐藏 UI 入口。

实现2: web/src/components/Layout.tsx:435
  - 模式：顶部搜索命令由 commandItems 数组集中声明。
  - 可复用：移除对应 path 的命令项可避免搜索入口暴露。
  - 需注意：Hermes 菜单与 OpenClaw 菜单分离，不能误删 Hermes 日志。

实现3: web/src/pages/Dashboard.tsx:65
  - 模式：仪表盘卡片直接在 DashboardPage JSX 中按区块渲染。
  - 可复用：删除目标卡片 JSX，并保留统计卡片依赖的数据加载。
  - 需注意：今日消息统计仍依赖 sessionActivity，不能删除会话轮询。

# 2. 项目约定
命名约定：React 组件使用 PascalCase，局部变量使用 camelCase。
文件组织：页面组件位于 web/src/pages，布局与导航位于 web/src/components。
导入顺序：React、路由、内部 API、图标、类型、项目工具。
代码风格：函数组件、Tailwind className、两空格缩进风格。

# 3. 可复用组件清单
web/src/components/Layout.tsx: openClawNavItems 与 commandItems 控制 OpenClaw UI 入口。
web/src/pages/Dashboard.tsx: DashboardPage 控制 OpenClaw 仪表盘卡片渲染。
web/src/lib/api.ts: api.getSessions 支撑今日消息统计，保留不改。

# 4. 测试策略
测试框架：前端使用 TypeScript 构建与 Vite 构建验证。
测试模式：运行 npm run build，覆盖类型检查和生产构建。
参考文件：web/package.json。
覆盖要求：确认卡片关键词与菜单 path 不再出现，构建通过。

# 5. 依赖和集成点
外部依赖：React、Vite、lucide-react。
内部依赖：LayoutShell 导航配置、DashboardPage 仪表盘渲染。
集成方式：前端路由菜单数组与页面 JSX 渲染。
配置来源：无需配置变更。

# 6. 技术选型理由
为什么用这个方案：需求是隐藏 UI 卡片和菜单，移除渲染入口最直接。
优势：改动面小，不影响后台接口与路由。
劣势和风险：直接访问旧路由仍可能可用，但不会从菜单和搜索进入。

# 7. 关键风险点
并发问题：无。
边界条件：Hermes 日志入口需保留，不应误删。
性能瓶颈：移除活动卡片减少仪表盘渲染负担。
安全考虑：无新增安全逻辑。
