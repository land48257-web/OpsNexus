package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestLoadDefaultsAndSSHKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := `security:
  admin_users: [{username: admin, password: test-password}]
assets:
  groups:
    - name: test
      servers:
        - id: ssh
          host: localhost
          port: 22
          user: test
          private_key_path: /tmp/test-key
`
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPSNEXUS_SECURITY_JWT_SECRET", "test-secret-from-environment")
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ServerAddress != ":8080" || cfg.LogLevel != "info" || cfg.Assets.Groups[0].Servers[0].PrivateKeyPath != "/tmp/test-key" {
		t.Fatalf("incorrect defaults or SSH key mapping: %+v", cfg)
	}
	if cfg.Security.JWTSecret != "test-secret-from-environment" {
		t.Fatal("environment override ignored")
	}
	if _, err := Load(filepath.Join(t.TempDir(), "missing.yaml")); err == nil {
		t.Fatal("missing config accepted")
	}
	if err := os.WriteFile(path, []byte("security: ["), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("malformed config accepted")
	}
}

func TestPasswordHashVariants(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	for _, prefix := range []string{"$2a$", "$2b$", "$2y$"} {
		value := prefix + string(hash)[4:]
		cfg := Config{Security: SecurityConfig{AdminUsers: []UserConfig{{Username: "admin", Password: value}}}}
		if err := cfg.HashPasswords(); err != nil {
			t.Fatal(err)
		}
		if cfg.Security.AdminUsers[0].Password != value {
			t.Fatal("existing bcrypt hash was rehashed")
		}
		if err := bcrypt.CompareHashAndPassword([]byte(value), []byte("password")); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAssetJSONDoesNotExposeCredentials(t *testing.T) {
	cfg := AssetConfig{Groups: []Group{{Servers: []Server{{Password: "private-password", PrivateKeyPath: "private-key"}}, Databases: []Database{{Password: "private-password", URI: "mongodb://user:private-password@host"}}}}}
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "private") || strings.Contains(string(data), "uri") {
		t.Fatalf("credentials leaked: %s", data)
	}
}

func TestValidateDuplicateAssets(t *testing.T) {
	cfg := Config{ServerAddress: ":8080", Security: SecurityConfig{JWTSecret: "test", SessionTimeoutMinutes: 30, AdminUsers: []UserConfig{{Username: "admin", Password: "test"}}}, Assets: AssetConfig{Groups: []Group{{Databases: []Database{{ID: "duplicate", Type: "mysql", Host: "localhost", Port: 3306}, {ID: "duplicate", Type: "redis", Host: "localhost", Port: 6379}}}}}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("duplicate IDs accepted")
	}
}
