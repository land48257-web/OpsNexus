package redis

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	redisdriver "github.com/redis/go-redis/v9"
	"opsnexus/internal/config"
	"opsnexus/internal/service/asset"
)

func TestRedisManager(t *testing.T) {
	server := miniredis.RunT(t)
	port, _ := strconv.Atoi(server.Port())
	if err := asset.Init(&config.AssetConfig{Groups: []config.Group{{Databases: []config.Database{{ID: "redis-test", Type: "redis", Host: server.Host(), Port: port, Database: "3"}}}}}); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{clients: make(map[string]*redisdriver.Client)}
	defer manager.CloseAll()
	client, err := manager.GetClient("redis-test", -1)
	if err != nil {
		t.Fatal(err)
	}
	explicit, err := manager.GetClient("redis-test", 3)
	if err != nil || client != explicit {
		t.Fatal("default DB creates a separate pool")
	}
	ctx := context.Background()
	t.Run("ttl and string value", func(t *testing.T) {
		if err := manager.UpdateKey(ctx, "redis-test", 3, "key", "string", "value", -1); err != nil {
			t.Fatal(err)
		}
		detail, err := manager.GetKeyDetail(ctx, "redis-test", 3, "key")
		if err != nil {
			t.Fatal(err)
		}
		if detail.TTL != -1 {
			t.Fatalf("persistent TTL=%v", detail.TTL)
		}
		if err := manager.UpdateKey(ctx, "redis-test", 3, "key", "string", "", 120*time.Second); err != nil {
			t.Fatal(err)
		}
		detail, err = manager.GetKeyDetail(ctx, "redis-test", 3, "key")
		if err != nil {
			t.Fatal(err)
		}
		if detail.TTL != 120 || detail.Value != "" {
			t.Fatalf("detail=%+v", detail)
		}
	})
	t.Run("hash merges and persists", func(t *testing.T) {
		if err := client.HSet(ctx, "hash", "unseen", "keep").Err(); err != nil {
			t.Fatal(err)
		}
		if err := client.Expire(ctx, "hash", time.Hour).Err(); err != nil {
			t.Fatal(err)
		}
		if err := manager.UpdateKey(ctx, "redis-test", 3, "hash", "hash", map[string]interface{}{"edited": "new"}, -1); err != nil {
			t.Fatal(err)
		}
		if client.HGet(ctx, "hash", "unseen").Val() != "keep" || client.TTL(ctx, "hash").Val() != -1 {
			t.Fatal("hash fields or TTL lost")
		}
	})
	t.Run("failed hash does not change TTL", func(t *testing.T) {
		if err := client.Set(ctx, "wrong-type", "string", time.Hour).Err(); err != nil {
			t.Fatal(err)
		}
		if err := manager.UpdateKey(ctx, "redis-test", 3, "wrong-type", "hash", map[string]interface{}{"field": "value"}, -1); err == nil {
			t.Fatal("wrong type accepted")
		}
		if client.TTL(ctx, "wrong-type").Val() != time.Hour {
			t.Fatal("failed update changed TTL")
		}
	})
	t.Run("missing command result is nil", func(t *testing.T) {
		result, err := manager.ExecuteCommand(ctx, "redis-test", 3, "GET", []interface{}{"missing"})
		if err != nil || result != nil {
			t.Fatalf("result=%v err=%v", result, err)
		}
		if _, err := manager.ExecuteCommand(ctx, "redis-test", 3, "MULTI", nil); err == nil {
			t.Fatal("stateful console command accepted")
		}
	})
}
