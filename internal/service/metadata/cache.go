package metadata

import (
	"fmt"
	"opsnexus/internal/service/executor"
	"sync"
	"time"

	"gorm.io/gorm"
)

// TableMetadata represents the compact structure for a table and its columns
type TableMetadata struct {
	Name    string   `json:"n"`
	Columns []string `json:"c"`
}

// CacheEntry holds the cached data and its expiration time
type CacheEntry struct {
	Tables    []TableMetadata
	ExpiresAt time.Time
}

// Manager handles metadata caching
type Manager struct {
	cache sync.Map
	ttl   time.Duration
}

var (
	instance *Manager
	once     sync.Once
)

// Get returns the singleton instance of Manager
func Get() *Manager {
	once.Do(func() {
		instance = &Manager{
			ttl: 30 * time.Minute,
		}
	})
	return instance
}

// GetOrLoad retrieves metadata from cache or loads it from the database
func (m *Manager) GetOrLoad(assetID, dbName string, provider executor.RDBMSProvider, db *gorm.DB) ([]TableMetadata, error) {
	key := [2]string{assetID, dbName}

	// Check cache
	if val, ok := m.cache.Load(key); ok {
		entry := val.(CacheEntry)
		if time.Now().Before(entry.ExpiresAt) {
			return entry.Tables, nil
		}
		// Expired, delete
		m.cache.Delete(key)
	}

	// Load from DB
	tables, err := provider.GetTables(db, dbName)
	if err != nil {
		return nil, err
	}

	metadata := make([]TableMetadata, 0, len(tables))
	for _, t := range tables {
		cols, err := provider.GetColumns(db, dbName, t.Name)
		if err != nil {
			return nil, fmt.Errorf("load columns for %s: %w", t.Name, err)
		}

		colNames := make([]string, len(cols))
		for i, c := range cols {
			colNames[i] = c.Name
		}

		metadata = append(metadata, TableMetadata{
			Name:    t.Name,
			Columns: colNames,
		})
	}

	// Store in cache
	m.cache.Store(key, CacheEntry{
		Tables:    metadata,
		ExpiresAt: time.Now().Add(m.ttl),
	})

	return metadata, nil
}

// Invalidate clears the cache for a specific database
func (m *Manager) Invalidate(assetID, dbName string) {
	key := [2]string{assetID, dbName}
	m.cache.Delete(key)
}

// InvalidateAsset clears all schema entries after DDL, including explicitly
// qualified objects outside the currently selected database.
func (m *Manager) InvalidateAsset(assetID string) {
	m.cache.Range(func(key, _ interface{}) bool {
		if key.([2]string)[0] == assetID {
			m.cache.Delete(key)
		}
		return true
	})
}
