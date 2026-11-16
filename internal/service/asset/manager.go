package asset

import (
	"fmt"
	"opsnexus/internal/config"
	"sync"
)

var (
	manager *Manager
	once    sync.Once
)

// Manager holds the loaded assets and provides lookup methods.
type Manager struct {
	Config *config.AssetConfig
	// Indexes for fast lookup
	ServerMap map[string]*config.Server
	DBMap     map[string]*config.Database
}

// Init initializes the global asset manager.
func Init(cfg *config.AssetConfig) error {
	var err error
	once.Do(func() {
		m := &Manager{
			Config:    cfg,
			ServerMap: make(map[string]*config.Server),
			DBMap:     make(map[string]*config.Database),
		}

		// Indexing
		for _, g := range cfg.Groups {
			for i := range g.Servers {
				s := &g.Servers[i]
				m.ServerMap[s.ID] = s
			}
			for i := range g.Databases {
				d := &g.Databases[i]
				m.DBMap[d.ID] = d
			}
		}
		manager = m
	})
	return err
}

// Get returns the singleton manager.
func Get() *Manager {
	return manager
}

// GetServer returns a server config by ID.
func (m *Manager) GetServer(id string) (*config.Server, error) {
	if s, ok := m.ServerMap[id]; ok {
		return s, nil
	}
	return nil, fmt.Errorf("server not found: %s", id)
}

// GetDatabase returns a database config by ID.
func (m *Manager) GetDatabase(id string) (*config.Database, error) {
	if d, ok := m.DBMap[id]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("database not found: %s", id)
}
