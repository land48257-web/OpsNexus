package mongo

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type MongoshCapabilities struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Path      string `json:"path"`
}

type MongoshProber struct {
	mu           sync.RWMutex
	capabilities *MongoshCapabilities
}

var (
	prober     *MongoshProber
	proberOnce sync.Once
)

func GetProber() *MongoshProber {
	proberOnce.Do(func() {
		prober = &MongoshProber{}
		prober.Probe() // Initial probe
	})
	return prober
}

func (p *MongoshProber) GetCapabilities() *MongoshCapabilities {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.capabilities
}

func (p *MongoshProber) Probe() *MongoshCapabilities {
	p.mu.Lock()
	defer p.mu.Unlock()

	caps := &MongoshCapabilities{
		Available: false,
	}

	// 1. Check ./bin/mongosh (Relative to CWD)
	cwd, _ := os.Getwd()
	localBin := filepath.Join(cwd, "bin", "mongosh")
	if runtime.GOOS == "windows" {
		localBin += ".exe"
	}

	if p.checkBinary(localBin, caps) {
		p.capabilities = caps
		return caps
	}

	// 2. Check PATH
	pathBin, err := exec.LookPath("mongosh")
	if err == nil {
		if p.checkBinary(pathBin, caps) {
			p.capabilities = caps
			return caps
		}
	}

	p.capabilities = caps
	return caps
}

func (p *MongoshProber) checkBinary(path string, caps *MongoshCapabilities) bool {
	if _, err := os.Stat(path); err != nil {
		return false
	}

	// Try to get version
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, "--version")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	caps.Available = true
	caps.Path = path
	caps.Version = strings.TrimSpace(string(output))
	return true
}
