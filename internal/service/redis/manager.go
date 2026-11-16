package redis

import (
	"context"
	"errors"
	"fmt"
	"net"
	"opsnexus/internal/service/asset"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Manager struct {
	clients map[string]*redis.Client
	mu      sync.RWMutex
}

var (
	manager *Manager
	once    sync.Once
)

func GetManager() *Manager {
	once.Do(func() {
		manager = &Manager{
			clients: make(map[string]*redis.Client),
		}
	})
	return manager
}

func (m *Manager) GetClient(assetID string, dbIndex int) (*redis.Client, error) {
	dbConfig, err := asset.Get().GetDatabase(assetID)
	if err != nil {
		return nil, err
	}
	if dbConfig.Type != "redis" {
		return nil, fmt.Errorf("asset %s is not a redis database", assetID)
	}
	if dbIndex == -1 {
		dbIndex = 0
		if dbConfig.Database != "" {
			dbIndex, err = strconv.Atoi(dbConfig.Database)
			if err != nil {
				return nil, fmt.Errorf("invalid default Redis database for %s", assetID)
			}
		}
	}
	if dbIndex < 0 {
		return nil, fmt.Errorf("invalid Redis database index")
	}
	cacheKey := fmt.Sprintf("%s:%d", assetID, dbIndex)
	m.mu.RLock()
	client := m.clients[cacheKey]
	m.mu.RUnlock()
	if client != nil {
		return client, nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if client := m.clients[cacheKey]; client != nil {
		return client, nil
	}
	rdb := redis.NewClient(&redis.Options{
		Addr:                  net.JoinHostPort(dbConfig.Host, strconv.Itoa(dbConfig.Port)),
		Password:              dbConfig.Password,
		Username:              dbConfig.User,
		ContextTimeoutEnabled: true,
		DB:                    dbIndex,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	m.clients[cacheKey] = rdb
	return rdb, nil
}

// ScanKeys safely scans keys with pagination
func (m *Manager) ScanKeys(ctx context.Context, assetID string, dbIndex int, pattern string, cursor uint64, count int64) ([]string, uint64, error) {
	client, err := m.GetClient(assetID, dbIndex)
	if err != nil {
		return nil, 0, err
	}

	keys, nextCursor, err := client.Scan(ctx, cursor, pattern, count).Result()
	if err != nil {
		return nil, 0, err
	}

	return keys, nextCursor, nil
}

type KeyDetail struct {
	Key   string      `json:"key"`
	Type  string      `json:"type"`
	TTL   float64     `json:"ttl"` // Seconds, -1 for persistent, -2 for not found
	Value interface{} `json:"value"`
}

// GetKeyDetail retrieves type, ttl and value of a key
func (m *Manager) GetKeyDetail(ctx context.Context, assetID string, dbIndex int, key string) (*KeyDetail, error) {
	client, err := m.GetClient(assetID, dbIndex)
	if err != nil {
		return nil, err
	}

	pipe := client.Pipeline()
	typeCmd := pipe.Type(ctx, key)
	ttlCmd := pipe.TTL(ctx, key)
	_, err = pipe.Exec(ctx)
	if err != nil {
		return nil, err
	}

	keyType := typeCmd.Val()
	ttlDuration := ttlCmd.Val()
	ttl := ttlDuration.Seconds()
	if ttlDuration < 0 {
		ttl = float64(ttlDuration)
	} // go-redis represents Redis -1/-2 as raw duration sentinels.

	var value interface{}

	// Limit large collections
	const maxItems = 100

	switch keyType {
	case "string":
		value, err = client.Get(ctx, key).Result()
	case "list":
		value, err = client.LRange(ctx, key, 0, maxItems-1).Result()
	case "set":
		// SScan is better for large sets, but for simplicity/preview we use SMembers with limit if possible?
		// SMembers returns all. Use SScan for safety if needed, or just SRandMemberN?
		// SScan is safer.
		var keys []string
		keys, _, err = client.SScan(ctx, key, 0, "*", maxItems).Result()
		value = keys
	case "zset":
		value, err = client.ZRangeWithScores(ctx, key, 0, maxItems-1).Result()
	case "hash":
		// HScan is safer than HGetAll
		var keys []string
		keys, _, err = client.HScan(ctx, key, 0, "*", maxItems).Result()
		// HScan returns [field, value, field, value...], convert to map
		kvMap := make(map[string]string)
		for i := 0; i < len(keys); i += 2 {
			if i+1 < len(keys) {
				kvMap[keys[i]] = keys[i+1]
			}
		}
		value = kvMap
	case "none":
		return nil, redis.Nil
	default:
		value = "Unsupported type: " + keyType
	}

	if err != nil {
		return nil, err
	}

	return &KeyDetail{
		Key:   key,
		Type:  keyType,
		TTL:   ttl,
		Value: value,
	}, nil
}

// UpdateKey replaces strings and merges only the supplied hash fields. Hash
// previews are partial, so replacing the whole hash would lose unseen fields.
func (m *Manager) UpdateKey(ctx context.Context, assetID string, dbIndex int, key, typeStr string, value interface{}, ttl time.Duration) error {
	if ttl < 0 && ttl != -1 {
		return fmt.Errorf("TTL must be -1, 0 or positive")
	}
	client, err := m.GetClient(assetID, dbIndex)
	if err != nil {
		return err
	}
	switch typeStr {
	case "string":
		value, ok := value.(string)
		if !ok {
			return fmt.Errorf("invalid value for string type")
		}
		if ttl < 0 {
			ttl = 0
		}
		return client.Set(ctx, key, value, ttl).Err()
	case "hash":
		values, ok := value.(map[string]interface{})
		if !ok || len(values) == 0 {
			return fmt.Errorf("hash requires at least one field")
		}
		args := []interface{}{int64(ttl / time.Millisecond)}
		for field, val := range values {
			switch val.(type) {
			case string, float64, int, int64, bool:
			default:
				return fmt.Errorf("hash values must be scalar values")
			}
			args = append(args, field, fmt.Sprint(val))
		}
		// Lua stops on a failed HSET, so a wrong-type key cannot have its TTL
		// accidentally changed by a later pipeline command.
		return client.Eval(ctx, `
            redis.call('HSET', KEYS[1], unpack(ARGV, 2))
            if tonumber(ARGV[1]) > 0 then
                redis.call('PEXPIRE', KEYS[1], ARGV[1])
            else
                redis.call('PERSIST', KEYS[1])
            end
            return 1`, []string{key}, args...).Err()
	default:
		return fmt.Errorf("update not implemented for type %s", typeStr)
	}
}

func (m *Manager) DeleteKeys(ctx context.Context, assetID string, dbIndex int, keys []string) error {
	client, err := m.GetClient(assetID, dbIndex)
	if err != nil {
		return err
	}
	return client.Del(ctx, keys...).Err()
}

func (m *Manager) ExecuteCommand(ctx context.Context, assetID string, dbIndex int, cmd string, args []interface{}) (interface{}, error) {
	client, err := m.GetClient(assetID, dbIndex)
	if err != nil {
		return nil, err
	}

	// Each HTTP call is one command. Stateful commands cannot span requests.
	switch strings.ToUpper(cmd) {
	case "SELECT", "MULTI", "EXEC", "DISCARD", "WATCH", "UNWATCH", "SUBSCRIBE", "PSUBSCRIBE", "SSUBSCRIBE", "MONITOR", "AUTH", "HELLO", "QUIT", "RESET":
		return nil, fmt.Errorf("%s is not supported by the stateless console", cmd)
	}
	// Isolate arbitrary console commands from the pooled UI connection state.
	opts := *client.Options()
	isolated := redis.NewClient(&opts)
	defer isolated.Close()
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmdArgs := append([]interface{}{cmd}, args...)
	result, err := isolated.Do(ctx, cmdArgs...).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	return result, err
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, client := range m.clients {
		_ = client.Close()
		delete(m.clients, key)
	}
}
