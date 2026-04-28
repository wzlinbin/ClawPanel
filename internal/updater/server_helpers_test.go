package updater

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"testing"
)

func TestServerStateHelpers(t *testing.T) {
	t.Parallel()

	server := NewServer("v1.0.0", t.TempDir(), "", 19527, "pro")

	server.setStep(0, "running", "checking")
	if step := server.state.Steps[0]; step.Status != "running" || step.Message != "checking" {
		t.Fatalf("unexpected step state after setStep(): %+v", step)
	}

	server.setProgress(42)
	if server.state.Progress != 42 {
		t.Fatalf("progress = %d, want 42", server.state.Progress)
	}

	server.setPhase("done")
	if server.state.Phase != "done" || server.state.FinishedAt == "" {
		t.Fatalf("unexpected phase after setPhase(done): %+v", server.state)
	}

	server.setStepError(1, "failed")
	if step := server.state.Steps[1]; step.Status != "error" || step.Message != "failed" {
		t.Fatalf("unexpected step state after setStepError(): %+v", step)
	}
	if server.state.Phase != "error" || server.state.FinishedAt == "" {
		t.Fatalf("unexpected phase after setStepError(): %+v", server.state)
	}

	server.logMsg("hello %s", "world")
	if got := server.state.Log[len(server.state.Log)-1]; got != "hello world" {
		t.Fatalf("log entry = %q, want hello world", got)
	}

	server.setError("boom")
	if server.state.Phase != "error" || server.state.Error != "boom" || server.state.Message != "更新失败" {
		t.Fatalf("unexpected state after setError(): %+v", server.state)
	}
	if got := server.state.Log[len(server.state.Log)-1]; got != "❌ boom" {
		t.Fatalf("last error log = %q, want ❌ boom", got)
	}
}

func TestRecordUpdateLogKeepsLast50Entries(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	server := NewServer("v1.0.0", dataDir, "", 19527, "pro")

	for i := 0; i < 55; i++ {
		server.state.FromVer = "v" + strconv.Itoa(i)
		server.state.ToVer = "v" + strconv.Itoa(i+1)
		server.state.Source = "github"
		server.state.Phase = "done"
		server.state.StartedAt = "start-" + strconv.Itoa(i)
		server.state.FinishedAt = "end-" + strconv.Itoa(i)
		server.recordUpdateLog()
	}

	data, err := os.ReadFile(filepath.Join(dataDir, "update_history.json"))
	if err != nil {
		t.Fatalf("ReadFile(update_history.json) error = %v", err)
	}

	var history []map[string]interface{}
	if err := json.Unmarshal(data, &history); err != nil {
		t.Fatalf("Unmarshal(history) error = %v", err)
	}
	if len(history) != 50 {
		t.Fatalf("history length = %d, want 50", len(history))
	}
	if history[0]["from"] != "v5" || history[len(history)-1]["from"] != "v54" {
		t.Fatalf("unexpected retained history range: first=%v last=%v", history[0]["from"], history[len(history)-1]["from"])
	}
}

func TestDownloadSourceHelpers(t *testing.T) {
	t.Parallel()

	tests := []struct {
		raw       string
		wantNorm  string
		wantOrder []string
	}{
		{raw: " github ", wantNorm: "github", wantOrder: []string{"github"}},
		{raw: "mirror", wantNorm: "github", wantOrder: []string{"github"}},
		{raw: "other", wantNorm: "github", wantOrder: []string{"github"}},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.raw, func(t *testing.T) {
			t.Parallel()

			if got := normalizeDownloadSource(tt.raw); got != tt.wantNorm {
				t.Fatalf("normalizeDownloadSource(%q) = %q, want %q", tt.raw, got, tt.wantNorm)
			}
			if got := downloadSourceOrder(tt.raw); !reflect.DeepEqual(got, tt.wantOrder) {
				t.Fatalf("downloadSourceOrder(%q) = %v, want %v", tt.raw, got, tt.wantOrder)
			}
		})
	}
}

func TestIsLikelySystemdServiceProcessUsesInvocationID(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("INVOCATION_ID-based detection is not used on Windows")
	}

	t.Setenv("INVOCATION_ID", "unit-test")
	if !isLikelySystemdServiceProcess() {
		t.Fatal("isLikelySystemdServiceProcess() should return true when INVOCATION_ID is set")
	}
}

func TestCommandExistsAndIsPortOpen(t *testing.T) {
	t.Parallel()

	existing := "sh"
	if runtime.GOOS == "windows" {
		existing = "cmd"
	}
	if !commandExists(existing) {
		t.Fatalf("commandExists(%q) = false, want true", existing)
	}
	if commandExists("clawpanel-command-that-should-not-exist") {
		t.Fatal("commandExists() unexpectedly found a fake command")
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if !isPortOpen(port) {
		t.Fatalf("isPortOpen(%d) = false, want true while listener is active", port)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}
