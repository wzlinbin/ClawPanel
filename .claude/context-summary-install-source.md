# 项目上下文摘要（一键源码安装脚本）
生成时间：2026-05-09 14:35:29

## 1. 相似实现分析
- scripts/install.sh: Release 二进制安装脚本，固定安装目录 /opt/clawpanel，注册 systemd/launchd，设置 CLAWPANEL_DATA 和服务运行用户。
- scripts/install-local-pro.sh: 本地构建包安装入口，检测当前平台二进制后复用 install.sh 的安装逻辑。
- Makefile: 标准构建流程为前端 
pm install && npx vite build，复制 web/dist 到 cmd/clawpanel/frontend/dist，再用 CGO_ENABLED=0 go build 生成单二进制。
- internal/config/config.go: 运行时配置从 CLAWPANEL_PORT、CLAWPANEL_DATA、ADMIN_TOKEN、CLAWPANEL_SECRET 等环境变量覆盖，并使用 clawpanel.json 持久化。

## 2. 项目约定
- 部署形态：单二进制，前端由 go:embed 内嵌。
- 默认安装目录：/opt/clawpanel。
- 默认数据目录：/opt/clawpanel/data。
- 默认服务名：clawpanel。
- 默认端口：19527。
- 默认登录密码：clawpanel。

## 3. 可复用组件清单
- scripts/install.sh: 服务注册、防火墙放行、安装结果提示样式。
- scripts/install-local-pro.sh: 平台识别和本地构建包安装模式。
- Makefile: 前后端构建命令和 ldflags 约定。
- internal/config/config.go: 环境变量与 JSON 字段协议。

## 4. 测试策略
- 静态校验：ash -n scripts/install-source.sh。
- 结构校验：检查关键函数、服务模板、构建命令和配置字段是否存在。
- 不执行真实安装：安装脚本会写 /opt 和系统服务，当前环境是 Windows 开发机，不做破坏性安装验证。

## 5. 依赖和集成点
- 外部依赖：git、go、
ode、
pm、curl 或 wget。
- 内部依赖：web/package.json、cmd/clawpanel/frontend/dist、cmd/clawpanel/main.go。
- 服务集成：Linux systemd，macOS launchd。
- 配置来源：环境变量优先，$DATA_DIR/clawpanel.json 作为持久化文件。

## 6. 技术选型理由
- 新增源码安装脚本而不修改 Release 安装脚本，避免破坏现有公开安装路径。
- 复用项目既有构建协议，保证当前改动后的前端页面被内嵌到二进制。
- 服务模板沿用现有安装脚本字段，降低部署行为差异。

## 7. 关键风险点
- 构建依赖缺失会失败：脚本会前置检查并提示安装缺失工具。
- npm install 网络慢：支持 NPM_REGISTRY 覆盖，默认使用项目 Makefile 同款镜像。
- 真实服务安装有系统副作用：验证阶段只做语法和结构校验。
