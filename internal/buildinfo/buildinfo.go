package buildinfo

var (
	Version = "dev"
	Edition = "pro"
)

func NormalizedEdition() string {
	return "pro"
}

func IsLite() bool {
	return false
}
