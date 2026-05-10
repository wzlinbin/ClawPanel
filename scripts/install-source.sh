#!/usr/bin/env bash
# ============================================================
# ClawPanel 二进制一键安装脚本（Linux/macOS）
# 用途：自动解析最新 pro-v* GitHub Release 中固定命名的 Linux 二进制文件并安装为系统服务。
#
# 推荐用法：
#   curl -fsSL https://raw.githubusercontent.com/wzlinbin/ClawPanel/main/scripts/install-source.sh | sudo bash
#
# 可选环境变量：
#   RELEASE_URL=https://github.com/wzlinbin/ClawPanel/releases/download/pro-v5.5.7/clawpanel
#   GITHUB_RELEASES_API=https://api.github.com/repos/wzlinbin/ClawPanel/releases?per_page=20
#   GITHUB_TAG_PREFIX=pro-v
#   INSTALL_DIR=/opt/clawpanel
#   DATA_DIR=/opt/clawpanel/data
#   PORT=19527
#   ADMIN_TOKEN=admin123
#   CLAWPANEL_SECRET=clawpanel-secret-change-me
#   CLAWPANEL_SERVICE_USER=root
# ============================================================

set -Eeuo pipefail

BINARY_NAME="clawpanel"
SERVICE_NAME="${SERVICE_NAME:-clawpanel}"
RELEASE_URL="${RELEASE_URL:-}"
GITHUB_RELEASES_API="${GITHUB_RELEASES_API:-https://api.github.com/repos/wzlinbin/ClawPanel/releases?per_page=20}"
GITHUB_TAG_PREFIX="${GITHUB_TAG_PREFIX:-pro-v}"
INSTALL_DIR="${INSTALL_DIR:-/opt/clawpanel}"
DATA_DIR="${DATA_DIR:-${INSTALL_DIR}/data}"
PORT="${PORT:-${CLAWPANEL_PORT:-19527}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin123}"
CLAWPANEL_SECRET="${CLAWPANEL_SECRET:-clawpanel-secret-change-me}"
BUILD_ROOT=""
DOWNLOADED_BINARY=""

RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
MAGENTA='\033[35m'
CYAN='\033[36m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${GREEN}[ClawPanel]${NC} $1"; }
info() { echo -e "${CYAN}[ClawPanel]${NC} $1"; }
warn() { echo -e "${YELLOW}[ClawPanel]${NC} $1"; }
err() { echo -e "${RED}[ClawPanel]${NC} $1" >&2; exit 1; }
step() { echo -e "${MAGENTA}[${1}/${2}]${NC} ${BOLD}$3${NC}"; }

cleanup() {
  if [[ -n "${BUILD_ROOT:-}" && -d "$BUILD_ROOT" ]]; then
    rm -rf "$BUILD_ROOT"
  fi
}
trap cleanup EXIT

print_banner() {
  echo ""
  echo -e "${MAGENTA}=================================================================${NC}"
  echo -e "${MAGENTA}  ClawPanel 二进制一键安装${NC}"
  echo -e "${MAGENTA}  下载 Release 二进制并注册系统服务${NC}"
  echo -e "${MAGENTA}=================================================================${NC}"
  echo ""
}

detect_os() {
  case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    linux) echo "linux" ;;
    darwin) echo "darwin" ;;
    *) err "不支持的操作系统：$(uname -s)，仅支持 Linux 和 macOS" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) err "不支持的 CPU 架构：$(uname -m)，仅支持 x86_64 和 arm64" ;;
  esac
}

get_ip() {
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' || true
  elif command -v ip >/dev/null 2>&1; then
    ip route get 1 2>/dev/null | awk '{print $7; exit}' || true
  fi
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    err "请使用 root 或 sudo 运行安装脚本。"
  fi
}

require_download_tool() {
  if command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1; then
    return
  fi
  err "缺少下载工具：请先安装 curl 或 wget 后重试。"
}

fetch_text() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl --connect-timeout 10 --max-time 60 --retry 2 --retry-delay 2 --retry-connrefused -fsSL "$url"
  else
    wget -T 60 --tries=2 -qO- "$url"
  fi
}

resolve_latest_release_url() {
  if [[ -n "${RELEASE_URL:-}" ]]; then
    echo "$RELEASE_URL"
    return
  fi

  command -v python3 >/dev/null 2>&1 || err "自动解析最新 Release 需要 python3。也可以通过 RELEASE_URL=... 手动指定下载地址。"

  local releases_json
  releases_json="$(fetch_text "$GITHUB_RELEASES_API")"
  python3 -c '
import json
import sys

prefix = sys.argv[1]
binary_name = sys.argv[2]
releases = json.load(sys.stdin)

for release in releases:
    tag = release.get("tag_name", "")
    if release.get("draft") or release.get("prerelease") or not tag.startswith(prefix):
        continue
    for asset in release.get("assets", []):
        if asset.get("name") == binary_name and asset.get("browser_download_url"):
            print(asset["browser_download_url"])
            raise SystemExit(0)

raise SystemExit("未找到可用的正式版 Release 资产：%s" % binary_name)
' "$GITHUB_TAG_PREFIX" "$BINARY_NAME" <<< "$releases_json"
}

download_file() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --connect-timeout 10 --max-time 300 --retry 2 --retry-delay 2 --retry-connrefused -fL "$url" -o "$dest"
  else
    wget -T 300 --tries=2 -O "$dest" "$url"
  fi
}

resolve_service_user() {
  local user="${CLAWPANEL_SERVICE_USER:-root}"
  user="$(printf '%s' "$user" | xargs 2>/dev/null || true)"
  [[ -n "$user" ]] || err "服务用户不能为空"
  echo "$user"
}

resolve_service_group() {
  local user="$1"
  if [[ "$user" == "root" ]]; then
    echo "root"
    return
  fi
  id -gn "$user" 2>/dev/null || echo "$user"
}

resolve_service_home() {
  local user="$1"
  if [[ "$user" == "root" ]]; then
    echo "/root"
    return
  fi
  if command -v getent >/dev/null 2>&1; then
    local home
    home="$(getent passwd "$user" | cut -d: -f6)"
    if [[ -n "$home" ]]; then
      echo "$home"
      return
    fi
  fi
  echo "/home/${user}"
}

validate_service_user() {
  local user="$1"
  if [[ "$user" != "root" ]] && ! id "$user" >/dev/null 2>&1; then
    err "指定的服务用户不存在：${user}。请先创建用户，或移除 CLAWPANEL_SERVICE_USER 后重试。"
  fi
}

download_binary() {
  BUILD_ROOT="$(mktemp -d)"
  DOWNLOADED_BINARY="${BUILD_ROOT}/${BINARY_NAME}"
  RELEASE_URL="$(resolve_latest_release_url)"
  log "下载二进制：${RELEASE_URL}"
  download_file "$RELEASE_URL" "$DOWNLOADED_BINARY"
  [[ -s "$DOWNLOADED_BINARY" ]] || err "下载失败：未生成有效二进制文件。"
  chmod +x "$DOWNLOADED_BINARY"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_default_config() {
  local service_home="$1"
  local config_file="${DATA_DIR}/clawpanel.json"
  local openclaw_dir="${OPENCLAW_DIR:-${service_home}/.openclaw}"
  local openclaw_app="${OPENCLAW_APP:-}"
  local openclaw_work="${OPENCLAW_WORK:-}"

  mkdir -p "$DATA_DIR"
  if [[ -f "$config_file" ]]; then
    warn "配置文件已存在，保留现有配置：${config_file}"
    return
  fi

  cat > "$config_file" <<EOF
{
  "port": ${PORT},
  "dataDir": "$(json_escape "$DATA_DIR")",
  "openClawDir": "$(json_escape "$openclaw_dir")",
  "openClawApp": "$(json_escape "$openclaw_app")",
  "openClawWork": "$(json_escape "$openclaw_work")",
  "edition": "pro",
  "jwtSecret": "$(json_escape "$CLAWPANEL_SECRET")",
  "adminToken": "$(json_escape "$ADMIN_TOKEN")",
  "debug": false
}
EOF
  log "已生成默认配置：${config_file}"
}

stop_existing_service() {
  local os="$1"
  if [[ "$os" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  elif [[ "$os" == "darwin" ]]; then
    launchctl unload -w /Library/LaunchDaemons/com.clawpanel.service.plist >/dev/null 2>&1 || true
  fi
}

install_binary() {
  local binary_path="$1"
  local service_user="$2"
  local service_group="$3"

  mkdir -p "$INSTALL_DIR" "$DATA_DIR"
  install -m 0755 "$binary_path" "${INSTALL_DIR}/${BINARY_NAME}"
  if [[ "$service_user" != "root" ]]; then
    chown -R "${service_user}:${service_group}" "$INSTALL_DIR" "$DATA_DIR"
  fi

  local file_size
  file_size="$(du -h "${INSTALL_DIR}/${BINARY_NAME}" | awk '{print $1}')"
  log "二进制已安装：${INSTALL_DIR}/${BINARY_NAME} (${file_size})"
}

register_linux_service() {
  local service_user="$1"
  local service_group="$2"
  local service_home="$3"

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=ClawPanel - OpenClaw Management Panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${service_user}
Group=${service_group}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${BINARY_NAME}
Restart=always
RestartSec=5
LimitNOFILE=65535
Environment=CLAWPANEL_DATA=${DATA_DIR}
Environment=HOME=${service_home}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
  log "systemd 服务已注册：${SERVICE_NAME}"
}

register_macos_service() {
  cat > /Library/LaunchDaemons/com.clawpanel.service.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clawpanel.service</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/${BINARY_NAME}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${DATA_DIR}/clawpanel.log</string>
    <key>StandardErrorPath</key>
    <string>${DATA_DIR}/clawpanel.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CLAWPANEL_DATA</key>
        <string>${DATA_DIR}</string>
        <key>HOME</key>
        <string>/root</string>
    </dict>
</dict>
</plist>
EOF

  launchctl load -w /Library/LaunchDaemons/com.clawpanel.service.plist >/dev/null 2>&1 || true
  log "launchd 服务已注册：com.clawpanel.service"
}

open_firewall() {
  if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 && \
      firewall-cmd --reload >/dev/null 2>&1 && \
      log "firewalld 已放行端口 ${PORT}" || warn "firewalld 配置失败，请手动放行端口 ${PORT}"
  elif command -v ufw >/dev/null 2>&1; then
    ufw allow "${PORT}/tcp" >/dev/null 2>&1 && \
      log "ufw 已放行端口 ${PORT}" || warn "ufw 配置失败，请手动放行端口 ${PORT}"
  elif command -v iptables >/dev/null 2>&1; then
    iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT >/dev/null 2>&1 && \
      log "iptables 已放行端口 ${PORT}" || warn "iptables 配置失败，请手动放行端口 ${PORT}"
  else
    info "未检测到防火墙工具，跳过端口放行"
  fi
}

install_openclaw_gateway() {
  export HOME="${service_home:-${HOME:-/root}}"

  curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
  loginctl enable-linger $(whoami)
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  nohup openclaw gateway --allow-unconfigured > ~/gateway.log 2>&1 &
}

install_hermes_gateway() {
  export HOME="${service_home:-${HOME:-/root}}"
  export PATH="$HOME/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
  export PATH="$HOME/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
  hermes setup
  hermes gateway install
  hermes gateway start
}

start_service() {
  local os="$1"
  if [[ "$os" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      log "服务启动成功"
    else
      warn "服务启动可能失败，请检查：journalctl -u ${SERVICE_NAME} -f"
    fi
  elif [[ "$os" == "darwin" ]]; then
    launchctl start com.clawpanel.service >/dev/null 2>&1 || true
    sleep 2
    log "服务已通过 launchd 启动"
  else
    warn "当前系统未注册服务，请手动运行：${INSTALL_DIR}/${BINARY_NAME}"
  fi
}

print_result() {
  local os="$1"
  local ip
  ip="$(get_ip)"
  [[ -n "$ip" ]] || ip="localhost"

  echo ""
  echo -e "${GREEN}=================================================================${NC}"
  echo -e "${GREEN}${BOLD}ClawPanel 安装完成${NC}"
  echo -e "${GREEN}=================================================================${NC}"
  echo ""
  echo -e "  访问地址：${BOLD}http://${ip}:${PORT}${NC}"
  echo -e "  本机地址：${BOLD}http://127.0.0.1:${PORT}${NC}"
  echo -e "  默认密码：${BOLD}${ADMIN_TOKEN}${NC}"
  echo -e "  安装目录：${INSTALL_DIR}"
  echo -e "  数据目录：${DATA_DIR}"
  echo ""

  if [[ "$os" == "linux" ]]; then
    echo -e "  ${BOLD}管理命令${NC}:"
    echo "    systemctl start ${SERVICE_NAME}"
    echo "    systemctl stop ${SERVICE_NAME}"
    echo "    systemctl restart ${SERVICE_NAME}"
    echo "    systemctl status ${SERVICE_NAME}"
    echo "    journalctl -u ${SERVICE_NAME} -f"
  elif [[ "$os" == "darwin" ]]; then
    echo -e "  ${BOLD}管理命令${NC}:"
    echo "    sudo launchctl start com.clawpanel.service"
    echo "    sudo launchctl stop com.clawpanel.service"
    echo "    tail -f ${DATA_DIR}/clawpanel.log"
  fi
  echo ""
  echo -e "${GREEN}=================================================================${NC}"
}

main() {
  print_banner
  require_root
  require_download_tool

  local sys_os
  local sys_arch
  local service_user
  local service_group
  local service_home

  sys_os="$(detect_os)"
  sys_arch="$(detect_arch)"
  service_user="$(resolve_service_user)"
  validate_service_user "$service_user"
  service_group="$(resolve_service_group "$service_user")"
  service_home="$(resolve_service_home "$service_user")"

  info "系统信息：${sys_os}/${sys_arch}"
  info "安装目录：${INSTALL_DIR}"
  info "数据目录：${DATA_DIR}"
  info "服务用户：${service_user}:${service_group}"
  echo ""

  step 1 7 "下载 ClawPanel 二进制..."
  download_binary

  step 2 7 "停止旧服务并覆盖二进制..."
  stop_existing_service "$sys_os"
  install_binary "$DOWNLOADED_BINARY" "$service_user" "$service_group"

  step 3 7 "写入默认配置..."
  write_default_config "$service_home"

  step 4 7 "注册系统服务并配置防火墙..."
  if [[ "$sys_os" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
    register_linux_service "$service_user" "$service_group" "$service_home"
  elif [[ "$sys_os" == "darwin" ]]; then
    register_macos_service
  else
    warn "未检测到可用服务管理器，跳过服务注册"
  fi
  open_firewall

  step 5 7 "启动 ClawPanel..."
  start_service "$sys_os"

  step 6 7 "安装 OpenClaw Gateway..."
  install_openclaw_gateway

  step 7 7 "安装 Hermes Gateway..."
  install_hermes_gateway

  print_result "$sys_os"
}

main "$@"
