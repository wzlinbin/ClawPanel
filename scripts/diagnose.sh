#!/usr/bin/env bash
# ClawPanel standard-edition diagnostic script.
# Usage: bash diagnose.sh

RED='\033[0;31m'; YEL='\033[1;33m'; GRN='\033[0;32m'; CYN='\033[0;36m'; BOLD='\033[1m'; RST='\033[0m'
ok()      { echo -e "  ${GRN}✔${RST}  $*"; }
warn()    { echo -e "  ${YEL}⚠${RST}  $*"; }
fail()    { echo -e "  ${RED}✘${RST}  $*"; }
info()    { echo -e "  ${CYN}ℹ${RST}  $*"; }
section() { echo -e "\n${BOLD}══ $* ══${RST}"; }

SERVICE_NAME="clawpanel"
DATA_DIR=""
OPENCLAW_CONFIG_DIR=""
PANEL_PORT=19527
GW_PORT=18789

if systemctl cat "$SERVICE_NAME" &>/dev/null 2>&1; then
  _data=$(systemctl cat "$SERVICE_NAME" 2>/dev/null | grep CLAWPANEL_DATA | head -1 | sed 's/.*CLAWPANEL_DATA=//')
  _ocdir=$(systemctl cat "$SERVICE_NAME" 2>/dev/null | grep OPENCLAW_DIR | head -1 | sed 's/.*OPENCLAW_DIR=//')
  [[ -n "$_data" ]] && DATA_DIR="$_data"
  [[ -n "$_ocdir" ]] && OPENCLAW_CONFIG_DIR="$_ocdir"
fi

if [[ -z "$DATA_DIR" ]]; then
  for p in /home/*/ClawPanel/data /root/ClawPanel/data /opt/clawpanel/data /var/lib/clawpanel; do
    for d in $p; do
      [[ -f "$d/clawpanel.json" ]] && { DATA_DIR="$d"; break 2; }
    done
  done
fi

if [[ -z "$OPENCLAW_CONFIG_DIR" ]]; then
  for d in /root/.openclaw "$HOME/.openclaw" /home/*/.openclaw; do
    for _d in $d; do
      [[ -f "$_d/openclaw.json" ]] && { OPENCLAW_CONFIG_DIR="$_d"; break 2; }
    done
  done
fi

CLAWPANEL_JSON=""
[[ -n "$DATA_DIR" && -f "$DATA_DIR/clawpanel.json" ]] && CLAWPANEL_JSON="$DATA_DIR/clawpanel.json"
OPENCLAW_JSON=""
[[ -n "$OPENCLAW_CONFIG_DIR" && -f "$OPENCLAW_CONFIG_DIR/openclaw.json" ]] && OPENCLAW_JSON="$OPENCLAW_CONFIG_DIR/openclaw.json"

if [[ -n "$OPENCLAW_JSON" ]] && command -v python3 &>/dev/null; then
  _gp=$(python3 -c "import json; d=json.load(open('$OPENCLAW_JSON')); print(d.get('gateway',{}).get('port',18789))" 2>/dev/null)
  [[ -n "$_gp" ]] && GW_PORT="$_gp"
fi

echo -e "\n${BOLD}╔════════════════════════════════════════════════╗${RST}"
echo -e "${BOLD}║     ClawPanel 诊断报告                          ║${RST}"
echo -e "${BOLD}╚════════════════════════════════════════════════╝${RST}"
echo -e "  时间:     $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo -e "  主机:     $(hostname)"
echo -e "  系统:     $(uname -srm)"
echo -e "  发行形态: 标准版"
echo -e "  数据目录: ${DATA_DIR:-未找到}"
echo -e "  OpenClaw配置: ${OPENCLAW_CONFIG_DIR:-未找到}"
echo -e "  服务名:   $SERVICE_NAME"
echo -e "  面板端口: $PANEL_PORT  网关端口: $GW_PORT"

section "1. systemd 服务状态"
if systemctl is-active "$SERVICE_NAME" &>/dev/null; then
  ok "systemd $SERVICE_NAME: active (running)"
else
  SVC_STATE=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "not-found")
  fail "systemd $SERVICE_NAME: $SVC_STATE"
fi

echo ""
info "服务配置:"
systemctl cat "$SERVICE_NAME" 2>/dev/null \
  | grep -E "ExecStart|Environment|WorkingDirectory|User" \
  | sed 's/^/     /' || warn "未找到 $SERVICE_NAME.service"

echo ""
info "最近日志 (过滤心跳):"
journalctl -u "$SERVICE_NAME" --no-pager -n 30 2>/dev/null \
  | grep -v "GET /api/status" | tail -15 | sed 's/^/     /' \
  || warn "无法读取 journalctl 日志"

section "2. 进程与端口"
PANEL_PID=$(pgrep -f "clawpanel" 2>/dev/null | grep -v "$$" | head -1 || true)
if [[ -n "$PANEL_PID" ]]; then
  ok "面板进程 PID: $PANEL_PID"
else
  fail "未找到 clawpanel 进程"
fi

GW_PID=$(pgrep -f "openclaw-gateway" 2>/dev/null | head -3 || true)
if [[ -n "$GW_PID" ]]; then
  ok "OpenClaw 网关进程 PID: $GW_PID"
else
  fail "未找到 openclaw-gateway 进程"
fi

for port in $PANEL_PORT $GW_PORT 19528; do
  listener=$(ss -tlnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | head -1 || true)
  if [[ -n "$listener" ]]; then
    ok "端口 $port 监听中 — $listener"
  else
    fail "端口 $port 未监听"
  fi
done

section "3. ClawPanel API 健康检查"
if curl -sf --max-time 5 "http://127.0.0.1:$PANEL_PORT/api/status" -o /tmp/_cp_status.json 2>/dev/null; then
  ok "ClawPanel API 响应正常"
  python3 - <<'PYEOF' 2>/dev/null || true
import json
try:
    d = json.load(open('/tmp/_cp_status.json'))
    p  = d.get('panel', {})
    oc = d.get('openclaw', {})
    rt = oc.get('runtime', {})
    gw = d.get('gateway', {})
    pr = d.get('process', {})
    print(f"     面板版本:  {p.get('version','?')} ({p.get('edition','?')})")
    print(f"     OC 已配置: {oc.get('configured')}")
    print(f"     运行状态:  {rt.get('state','?')} — {rt.get('title','')}")
    print(f"     网关在线:  {gw.get('running')}")
    print(f"     进程运行:  {pr.get('running')}, PID: {pr.get('pid',0)}")
    print(f"     当前模型:  {oc.get('currentModel') or '未设置'}")
except Exception as e:
    print(f"     解析失败: {e}")
PYEOF
else
  fail "ClawPanel API 无响应 (http://127.0.0.1:$PANEL_PORT/api/status)"
fi

GW_HEALTH=$(curl -sf --max-time 5 "http://127.0.0.1:$GW_PORT/healthz" 2>/dev/null || true)
if echo "$GW_HEALTH" | grep -q '"status"'; then
  ok "网关 /healthz: $GW_HEALTH"
elif curl -sf --max-time 5 "http://127.0.0.1:$GW_PORT/" 2>/dev/null | grep -qi "openclaw"; then
  ok "网关 HTTP 响应正常 (含 openclaw 标识)"
else
  fail "网关 HTTP 无响应 (端口 $GW_PORT)"
fi

section "4. OpenClaw 安装"
if command -v openclaw &>/dev/null; then
  ok "openclaw: $(openclaw --version 2>/dev/null || echo '版本未知')  ($(command -v openclaw))"
else
  fail "openclaw 不在 PATH 中"
  for nvmd in /root/.nvm /home/*/.nvm; do
    for _d in $nvmd; do
      _oc=$(find "$_d" -name openclaw -type f 2>/dev/null | head -1)
      [[ -n "$_oc" ]] && warn "找到 openclaw: $_oc，但未在 PATH 中"
    done
  done
fi

section "5. openclaw.json 配置"
if [[ -n "$OPENCLAW_JSON" ]]; then
  FSIZE=$(stat -c%s "$OPENCLAW_JSON" 2>/dev/null || echo 0)
  if [[ "$FSIZE" -lt 10 ]]; then
    fail "openclaw.json 为空或过小 ($FSIZE 字节)"
  else
    ok "openclaw.json: $OPENCLAW_JSON ($FSIZE 字节)"
  fi
else
  fail "未找到 openclaw.json"
  info "OpenClaw 配置目录: ${OPENCLAW_CONFIG_DIR:-未探测到}"
fi

section "6. 错误日志"
ERRORS=$(journalctl -u "$SERVICE_NAME" --no-pager -n 200 2>/dev/null \
  | grep -iE " error| fail| fatal| panic| cannot| permission denied| no such file" \
  | grep -v "GET /api" | tail -15 || true)
if [[ -n "$ERRORS" ]]; then
  warn "journalctl 中的错误/警告 (最近15条):"
  echo "$ERRORS" | sed 's/^/     /'
else
  ok "journalctl 中无明显错误日志"
fi

section "7. 系统资源"
DISK_PCT=$(df / 2>/dev/null | awk 'NR==2{gsub(/%/,""); print $5}')
DISK_FREE=$(df -h / 2>/dev/null | awk 'NR==2{print $4}')
[[ "${DISK_PCT:-0}" -gt 90 ]] \
  && fail "磁盘空间严重不足: 剩余 $DISK_FREE ($DISK_PCT% 已用)" \
  || ok "磁盘剩余: $DISK_FREE ($DISK_PCT% 已用)"
MEM_FREE=$(free -m 2>/dev/null | awk '/^Mem/{print $7}')
MEM_TOTAL=$(free -m 2>/dev/null | awk '/^Mem/{print $2}')
ok "内存: 可用 ${MEM_FREE:-?} MB / 总计 ${MEM_TOTAL:-?} MB"

section "8. 外网连通性"
for host in "github.com" "api.github.com" "registry.npmjs.org"; do
  if curl -sf --max-time 6 "https://$host" &>/dev/null; then
    ok "$host 可达"
  else
    warn "$host 不可达（可能影响更新/安装）"
  fi
done

section "诊断完成"
echo ""
echo -e "  请将以上完整输出提供给开发者分析。"
echo -e "  常见修复: ${BOLD}systemctl restart clawpanel${RST}"
echo ""
