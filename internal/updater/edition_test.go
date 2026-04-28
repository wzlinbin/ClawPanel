package updater

import "testing"

func TestNewEditionConfig(t *testing.T) {
	t.Parallel()

	pro := newEditionConfig("something-else")
	if pro.Edition != "pro" || pro.ServiceName != "clawpanel" || pro.BinaryName != "clawpanel" || pro.GitHubTagPrefix != "pro-v" {
		t.Fatalf("unexpected pro config: %+v", pro)
	}
}

func TestEditionConfigTagHelpers(t *testing.T) {
	t.Parallel()

	pro := newEditionConfig("pro")
	if pro.matchesTag("other-v1.2.3") {
		t.Fatal("matchesTag() should reject wrong edition prefix")
	}
}

func TestEditionConfigAssetHelpers(t *testing.T) {
	t.Parallel()

	pro := newEditionConfig("pro")
	if got := pro.assetPrefix("1.2.3"); got != "clawpanel-v1.2.3" {
		t.Fatalf("assetPrefix(pro) = %q", got)
	}
	if got := pro.binaryAssetName("1.2.3", "linux_amd64"); got != "clawpanel-v1.2.3-linux-amd64" {
		t.Fatalf("binaryAssetName(pro linux) = %q", got)
	}
	if got := pro.binaryAssetName("1.2.3", "windows_amd64"); got != "clawpanel-v1.2.3-windows-amd64.exe" {
		t.Fatalf("binaryAssetName(pro windows) = %q", got)
	}
	if got := pro.updateAssetName("1.2.3", "darwin_arm64"); got != "clawpanel-v1.2.3-darwin-arm64" {
		t.Fatalf("updateAssetName(pro) = %q", got)
	}
}

func TestEditionConfigMatchUpdateAsset(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		cfg       editionConfig
		version   string
		assetName string
		wantKey   string
		wantMatch bool
	}{
		{
			name:      "pro linux asset",
			cfg:       newEditionConfig("pro"),
			version:   "1.2.3",
			assetName: " clawpanel-v1.2.3-linux-amd64 ",
			wantKey:   "linux_amd64",
			wantMatch: true,
		},
		{
			name:      "unknown asset",
			cfg:       newEditionConfig("pro"),
			version:   "1.2.3",
			assetName: "clawpanel-v1.2.3-freebsd-amd64",
			wantKey:   "",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotKey, gotMatch := tt.cfg.matchUpdateAsset(tt.version, tt.assetName)
			if gotKey != tt.wantKey || gotMatch != tt.wantMatch {
				t.Fatalf("matchUpdateAsset(%q) = (%q, %v), want (%q, %v)", tt.assetName, gotKey, gotMatch, tt.wantKey, tt.wantMatch)
			}
		})
	}
}
