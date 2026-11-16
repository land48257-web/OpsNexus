package metadata

import (
	"errors"
	"gorm.io/gorm"
	"opsnexus/internal/service/executor"
	"testing"
	"time"
)

type schemaProvider struct {
	executor.MySQLProvider
	columns []executor.ColumnInfo
	fail    bool
	loads   int
}

func (p *schemaProvider) GetTables(*gorm.DB, string) ([]executor.TableInfo, error) {
	p.loads++
	return []executor.TableInfo{{Name: "items"}}, nil
}
func (p *schemaProvider) GetColumns(*gorm.DB, string, string) ([]executor.ColumnInfo, error) {
	if p.fail {
		return nil, errors.New("temporary failure")
	}
	return p.columns, nil
}

func TestMetadataFailureIsNotCachedAndDDLInvalidatesSchemas(t *testing.T) {
	manager := &Manager{ttl: time.Minute}
	provider := &schemaProvider{columns: []executor.ColumnInfo{{Name: "before"}}}
	if _, err := manager.GetOrLoad("asset", "schema", provider, nil); err != nil {
		t.Fatal(err)
	}
	provider.columns = []executor.ColumnInfo{{Name: "after"}}
	cached, err := manager.GetOrLoad("asset", "schema", provider, nil)
	if err != nil || cached[0].Columns[0] != "before" {
		t.Fatal("cache not reused")
	}
	manager.InvalidateAsset("asset")
	provider.fail = true
	if _, err := manager.GetOrLoad("asset", "schema", provider, nil); err == nil {
		t.Fatal("partial schema reported success")
	}
	provider.fail = false
	updated, err := manager.GetOrLoad("asset", "schema", provider, nil)
	if err != nil || updated[0].Columns[0] != "after" {
		t.Fatal("failed metadata was cached")
	}
}

func TestMetadataKeysCannotCollide(t *testing.T) {
	manager := &Manager{ttl: time.Minute}
	provider := &schemaProvider{}
	for _, key := range [][2]string{{"a:b", "c"}, {"a", "b:c"}} {
		if _, err := manager.GetOrLoad(key[0], key[1], provider, nil); err != nil {
			t.Fatal(err)
		}
	}
	if provider.loads != 2 {
		t.Fatal("different asset/schema tuples shared a cache entry")
	}
}
