# ClawPanel 部署指南

## 当前推荐方式

- ClawPanel 只发布标准版：面板保持轻量，不内置 OpenClaw runtime。
- OpenClaw 作为外部运行时管理：可以先自行安装，也可以在面板内使用软件安装中心安装。
- 当前仓库没有提供官方 ClawPanel Docker 镜像。如果你的 OpenClaw 跑在 Docker / 1Panel 中，建议继续让 OpenClaw 保持容器化，只把 ClawPanel 作为宿主机面板运行。
- 安装、更新、发布资产统一使用 GitHub Releases，不再依赖旧自建镜像或第三方同步链路。

## 环境要求

| 组件 | 建议版本 |
| --- | --- |
| Linux | Ubuntu 22.04+ / Debian 12+ / CentOS Stream 9+ |
| macOS | 13+ |
| systemd | Linux 推荐使用 |
| OpenClaw | 近期稳定版本 |

## 安装

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/zhaoxinyi02/ClawPanel/main/scripts/install.sh | sudo bash
```

如果需要以非 root 用户运行服务，可以先创建用户，再执行：

```bash
sudo useradd -r -m -s /bin/bash clawpanel
curl -fsSL https://raw.githubusercontent.com/zhaoxinyi02/ClawPanel/main/scripts/install.sh | sudo CLAWPANEL_SERVICE_USER=clawpanel bash
```

安装完成后默认访问：

```text
http://<your-host>:19527
```

### Windows / WSL

- Windows 推荐直接运行标准版二进制或安装脚本。
- 如果 OpenClaw 跑在 WSL 或 Docker 中，请把 ClawPanel 当作外部面板接入，不要依赖 Windows 面板去直接拉起 Linux 版 OpenClaw。
- 通过环境变量或 systemd drop-in 指定 `OPENCLAW_DIR` 到实际配置目录。

## 接管 Docker / 1Panel 中的 OpenClaw

如果 OpenClaw 已经运行在 Docker / 1Panel 中，不需要把 ClawPanel 也放进容器。只需要保证宿主机上的 ClawPanel 能读到 OpenClaw 的配置目录。

例如 systemd drop-in：

```ini
[Service]
Environment="OPENCLAW_DIR=/opt/1panel/apps/openclaw/OpenClaw/data/conf"
```

更新后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart clawpanel
```

说明：

- `OPENCLAW_DIR` 指向包含 `openclaw.json` 的目录。
- ClawPanel 会把该实例识别为外部托管运行时。
- 如果你的网关绑定端口不是默认值，也请同步检查 OpenClaw 侧的 gateway 配置。

## 更新

```bash
curl -fsSL https://raw.githubusercontent.com/zhaoxinyi02/ClawPanel/main/scripts/update-pro.sh | sudo bash
```

## 常用运维命令

```bash
sudo systemctl status clawpanel
sudo systemctl restart clawpanel
journalctl -u clawpanel -n 100 --no-pager
```

## 常见问题

### 面板显示 OpenClaw / 网关离线，但 Docker 里实际正常

- 确认 `OPENCLAW_DIR` 指向的是宿主机上真实的配置目录。
- 确认网关端口从宿主机可访问，而不是只在容器内部监听。
- 升级到最新版本，近期版本已放宽外部托管实例的健康探测规则，并补齐官方插件通道的直装兜底。

### NapCat 网页已登录，但面板仍显示未登录

- 升级到最新版本。
- 在通道页重新触发一次状态检测。
- 若 NapCat 重启过，等待 10 到 30 秒让 WebUI token 和登录态重新同步。
