package handler

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zhaoxinyi02/ClawPanel/internal/config"
)

func readSoftwareSource(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("software.go")
	if err != nil {
		t.Fatalf("read software.go: %v", err)
	}
	return string(raw)
}

func softwareCaseSource(t *testing.T, caseID string) string {
	t.Helper()
	source := readSoftwareSource(t)
	startMarker := `case "` + caseID + `":`
	start := strings.Index(source, startMarker)
	if start < 0 {
		t.Fatalf("missing %s", startMarker)
	}
	rest := source[start+len(startMarker):]
	end := strings.Index(rest, "\n\t\tcase ")
	if end < 0 {
		return rest
	}
	return rest[:end]
}

func TestBuildNapCatInstallScriptUsesConfiguredQQToken(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	openClawDir := filepath.Join(dir, "custom-openclaw")
	if err := os.MkdirAll(openClawDir, 0755); err != nil {
		t.Fatalf("mkdir openclaw dir: %v", err)
	}

	raw := `{
  // json5 comment
  channels: {
    qq: {
      enabled: true,
      accessToken: "qq-token-$123",
    },
  },
}`
	if err := os.WriteFile(filepath.Join(openClawDir, "openclaw.json"), []byte(raw), 0644); err != nil {
		t.Fatalf("write openclaw.json: %v", err)
	}

	cfg := &config.Config{
		OpenClawDir:  openClawDir,
		OpenClawWork: filepath.Join(dir, "work"),
	}

	script := buildNapCatInstallScript(cfg)
	if strings.Contains(script, `${HOME}/.openclaw`) {
		t.Fatalf("script should not hardcode the default openclaw dir")
	}
	if !strings.Contains(script, openClawDir) {
		t.Fatalf("script should mount the configured openclaw dir")
	}

	expectedB64 := base64.StdEncoding.EncodeToString([]byte("qq-token-$123"))
	if !strings.Contains(script, expectedB64) {
		t.Fatalf("script should embed the configured qq access token via base64")
	}
	if !strings.Contains(script, "export WS_TOKEN_B64=") {
		t.Fatalf("script should export WS_TOKEN_B64 for the python subprocess")
	}
	if !strings.Contains(script, "WS_TOKEN_JSON=$(python3 - <<'PY'") {
		t.Fatalf("script should JSON-encode the token before writing onebot11.json")
	}
	if !strings.Contains(script, `\"token\": ${WS_TOKEN_JSON}`) {
		t.Fatalf("script should inject the JSON-encoded token into onebot11.json")
	}
}

func TestDetectPythonVersionFallsBackToWindowsStyleCommands(t *testing.T) {
	t.Parallel()

	called := make([]string, 0, 3)
	got := detectPythonVersionWith(func(name string, args ...string) string {
		called = append(called, name)
		switch name {
		case "python3":
			return ""
		case "python":
			return "Python 3.12.8"
		default:
			return ""
		}
	})

	if got != "Python 3.12.8" {
		t.Fatalf("expected python fallback version, got %q", got)
	}
	if len(called) < 2 || called[0] != "python3" || called[1] != "python" {
		t.Fatalf("unexpected command order: %#v", called)
	}
}

func TestDetectPythonVersionFallsBackToPyLauncher(t *testing.T) {
	t.Parallel()

	got := detectPythonVersionWith(func(name string, args ...string) string {
		if name == "py" {
			return "Python 3.11.9"
		}
		return ""
	})

	if got != "Python 3.11.9" {
		t.Fatalf("expected py launcher version, got %q", got)
	}
}

func TestHermesInstallScriptUsesRuntimeHomeFallback(t *testing.T) {
	t.Parallel()

	source := softwareCaseSource(t, "hermes")
	if strings.Contains(source, `export HOME="${HOME:-/root}"`) {
		t.Fatalf("hermes install script should not hardcode /root home fallback")
	}
	if !strings.Contains(source, `export HOME="${HOME:-$(cd ~ && pwd)}"`) {
		t.Fatalf("hermes install script should use runtime HOME fallback")
	}
}

func TestOpenClawInstallScriptUsesOfficialInstaller(t *testing.T) {
	t.Parallel()

	source := softwareCaseSource(t, "openclaw")
	if !strings.Contains(source, `curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- --no-onboard`) {
		t.Fatalf("openclaw install script should use the official installer")
	}
	if !strings.Contains(source, `--no-onboard`) {
		t.Fatalf("openclaw install script should skip interactive onboarding")
	}
	for _, want := range []string{
		`export PATH="$HOME/.openclaw/bin:$PATH"`,
		`openclaw gateway install`,
		`openclaw gateway start`,
		`openclaw_gateway_needs_background`,
		`systemctl --user unavailable`,
		`DBUS_SESSION_BUS_ADDRESS`,
		`XDG_RUNTIME_DIR`,
		`nohup openclaw gateway >"$log_file" 2>&1 &`,
		`$HOME/.openclaw/gateway.pid`,
		`$HOME/.openclaw/gateway.log`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("openclaw install script should contain %q", want)
		}
	}
	for _, notWant := range []string{
		`export OPENCLAW_DIR=%s`,
		`export OPENCLAW_CONFIG_PATH="$OPENCLAW_DIR/openclaw.json"`,
		`export NPM_CONFIG_PREFIX="$OPENCLAW_DIR/npm"`,
		`export npm_config_prefix="$NPM_CONFIG_PREFIX"`,
		`"$OPENCLAW_DIR/bin/openclaw"`,
		`$HOME/.hermes/node/bin`,
		`npm prefix -g`,
		`npm config get prefix`,
		`openclaw daemon start`,
		`json5`,
	} {
		if strings.Contains(source, notWant) {
			t.Fatalf("openclaw install script should stay close to official install.sh and not contain %q", notWant)
		}
	}
}

func TestHermesInstallScriptRunsPostInstallSetupAndGateway(t *testing.T) {
	t.Parallel()

	source := softwareCaseSource(t, "hermes")
	for _, want := range []string{
		`run_hermes_post_install()`,
		`hermes setup`,
		`hermes gateway install`,
		`hermes gateway start`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("hermes install script should contain %q", want)
		}
	}
	if strings.Contains(source, `echo "ℹ️ 下一步建议运行: hermes setup"`) {
		t.Fatalf("hermes install script should run setup instead of only suggesting it")
	}
}

func TestHermesInstallScriptDoesNotUseSystemServiceFallback(t *testing.T) {
	t.Parallel()

	source := softwareCaseSource(t, "hermes")
	for _, notWant := range []string{
		`hermes gateway install --system`,
		`hermes gateway start --system`,
		`systemctl list-unit-files`,
		`systemctl --user show-environment`,
		`prepare_hermes_user_systemd_env`,
		`XDG_RUNTIME_DIR`,
		`DBUS_SESSION_BUS_ADDRESS`,
		`hermes gateway run`,
		`gateway.pid`,
		`跳过 hermes gateway install`,
	} {
		if strings.Contains(source, notWant) {
			t.Fatalf("hermes install script should run gateway install/start directly and not contain %q", notWant)
		}
	}
}

func TestDefaultOpenClawPostInstallPluginsUseOfficialCommands(t *testing.T) {
	t.Parallel()

	got := defaultOpenClawPostInstallPlugins()
	if len(got) != 2 {
		t.Fatalf("default post-install plugin count = %d, want 2", len(got))
	}
	want := map[string]string{
		"qqbot":           "openclaw plugins install @openclaw/qqbot",
		"openclaw-weixin": "npx -y @tencent-weixin/openclaw-weixin-cli install",
	}
	for _, item := range got {
		if want[item.ID] != item.Command {
			t.Fatalf("unexpected post-install plugin command for %s: %q", item.ID, item.Command)
		}
	}
}

func TestOpenClawPostInstallPluginScriptUsesOnlyQQBotAndWeixin(t *testing.T) {
	t.Parallel()

	script := buildOpenClawPostInstallPluginScript()
	for _, want := range []string{
		`openclaw plugins install @openclaw/qqbot`,
		`npx -y @tencent-weixin/openclaw-weixin-cli install`,
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("post-install plugin script should contain %q", want)
		}
	}
	for _, notWant := range []string{
		`official/qq`,
		`official/feishu`,
		`openclaw-lark`,
		`@wecom/wecom-openclaw-plugin`,
		`@largezhou/ddingtalk`,
	} {
		if strings.Contains(script, notWant) {
			t.Fatalf("post-install plugin script should not contain %q", notWant)
		}
	}
}

func TestSoftwareListPassesConfigToHermesDetection(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("software.go")
	if err != nil {
		t.Fatalf("read software.go: %v", err)
	}
	source := string(raw)
	if strings.Contains(source, "hermesStatus := detectHermesStatus()\n") {
		t.Fatalf("software list should pass config into Hermes detection")
	}
	if !strings.Contains(source, "hermesStatus := detectHermesStatus(cfg)") {
		t.Fatalf("software list should use configured workspace for Hermes detection")
	}
}
