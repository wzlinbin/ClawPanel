package handler

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zhaoxinyi02/ClawPanel/internal/config"
)

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

	raw, err := os.ReadFile("software.go")
	if err != nil {
		t.Fatalf("read software.go: %v", err)
	}
	source := string(raw)
	if strings.Contains(source, `export HOME="${HOME:-/root}"`) {
		t.Fatalf("hermes install script should not hardcode /root home fallback")
	}
	if !strings.Contains(source, `export HOME="${HOME:-$(cd ~ && pwd)}"`) {
		t.Fatalf("hermes install script should use runtime HOME fallback")
	}
}

func TestOpenClawInstallScriptSkipsInteractiveOnboarding(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("software.go")
	if err != nil {
		t.Fatalf("read software.go: %v", err)
	}
	source := string(raw)
	if !strings.Contains(source, `OPENCLAW_NO_ONBOARD=1 bash -s -- --no-onboard`) {
		t.Fatalf("openclaw install script should skip interactive onboarding")
	}
	if !strings.Contains(source, `export OPENCLAW_DIR=%s`) {
		t.Fatalf("openclaw install script should set OPENCLAW_DIR from ClawPanel config")
	}
	if !strings.Contains(source, `export OPENCLAW_CONFIG_PATH="$OPENCLAW_DIR/openclaw.json"`) {
		t.Fatalf("openclaw install script should set OPENCLAW_CONFIG_PATH")
	}
	if !strings.Contains(source, `export NPM_CONFIG_PREFIX="$OPENCLAW_DIR/npm"`) {
		t.Fatalf("openclaw install script should isolate npm prefix under OPENCLAW_DIR")
	}
	if !strings.Contains(source, `export npm_config_prefix="$NPM_CONFIG_PREFIX"`) {
		t.Fatalf("openclaw install script should set lowercase npm prefix env")
	}
	if !strings.Contains(source, `"$OPENCLAW_DIR/bin/openclaw"`) {
		t.Fatalf("openclaw install script should create a managed executable under OPENCLAW_DIR/bin")
	}
	if !strings.Contains(source, `"$NPM_CONFIG_PREFIX"/bin/openclaw`) {
		t.Fatalf("openclaw install script should only source npm bin from OpenClaw's isolated prefix")
	}
	if !strings.Contains(source, `export PATH="$OPENCLAW_DIR/bin`) {
		t.Fatalf("openclaw install script should prefer OPENCLAW_DIR/bin on PATH")
	}
	if strings.Contains(source, `$HOME/.hermes/node/bin`) {
		t.Fatalf("openclaw install script should not hardcode the Hermes-managed node bin path")
	}
	if !strings.Contains(source, `npm prefix -g`) || !strings.Contains(source, `npm config get prefix`) {
		t.Fatalf("openclaw install script should discover npm global bin dynamically")
	}
	if !strings.Contains(source, `openclaw daemon start`) {
		t.Fatalf("openclaw install script should try to start the daemon after install")
	}
}

func TestHermesInstallScriptRunsPostInstallSetupAndGateway(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("software.go")
	if err != nil {
		t.Fatalf("read software.go: %v", err)
	}
	source := string(raw)
	for _, want := range []string{
		`run_hermes_post_install()`,
		`hermes setup`,
		`hermes gateway install`,
		`hermes gateway start`,
		`systemctl --user show-environment`,
		`hermes gateway run`,
		`gateway.pid`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("hermes install script should contain %q", want)
		}
	}
	if strings.Contains(source, `echo "ℹ️ 下一步建议运行: hermes setup"`) {
		t.Fatalf("hermes install script should run setup instead of only suggesting it")
	}
}

func TestDefaultOpenClawChannelPluginIDsIncludesAllChannelCards(t *testing.T) {
	t.Parallel()

	got := strings.Join(defaultOpenClawChannelPluginIDs(), ",")
	want := "qq,qqbot,feishu,wecom,dingtalk"
	if got != want {
		t.Fatalf("default channel plugins = %q, want %q", got, want)
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
