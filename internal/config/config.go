package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
	"golang.org/x/crypto/bcrypt"
)

type Config struct {
	ServerAddress string         `mapstructure:"server_address"`
	LogLevel      string         `mapstructure:"log_level"`
	BasePath      string         `mapstructure:"base_path"`
	Security      SecurityConfig `mapstructure:"security"`
	Assets        AssetConfig    `mapstructure:"assets"`
}

type SecurityConfig struct {
	SessionTimeoutMinutes int          `mapstructure:"session_timeout_minutes"`
	AdminUsers            []UserConfig `mapstructure:"admin_users"`
	JWTSecret             string       `mapstructure:"jwt_secret"`
}

type UserConfig struct {
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
}

// Load uses an isolated Viper instance so repeated loads cannot retain old assets.
func Load(configPath string) (*Config, error) {
	v := viper.New()
	v.SetDefault("server_address", ":8080")
	v.SetDefault("log_level", "info")
	v.SetDefault("base_path", "")
	v.SetDefault("security.session_timeout_minutes", 30)
	v.SetDefault("security.jwt_secret", "")
	v.SetEnvPrefix("OPSNEXUS")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()
	if configPath != "" {
		v.SetConfigFile(configPath)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
	}
	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) Validate() error {
	if strings.TrimSpace(c.Security.JWTSecret) == "" {
		return fmt.Errorf("security.jwt_secret must not be empty")
	}
	if c.Security.SessionTimeoutMinutes < 1 || c.Security.SessionTimeoutMinutes > 1440 {
		return fmt.Errorf("security.session_timeout_minutes must be between 1 and 1440")
	}
	if strings.TrimSpace(c.ServerAddress) == "" {
		return fmt.Errorf("server_address must not be empty")
	}
	if strings.ContainsAny(c.BasePath, "?#\\\r\n") || strings.Contains(c.BasePath, "..") || strings.Contains(c.BasePath, "//") {
		return fmt.Errorf("base_path must be a URL path without query, fragment, or parent segments")
	}
	if len(c.Security.AdminUsers) == 0 {
		return fmt.Errorf("security.admin_users must contain at least one user")
	}
	users := make(map[string]bool)
	for _, u := range c.Security.AdminUsers {
		if strings.TrimSpace(u.Username) == "" || users[u.Username] || u.Password == "" {
			return fmt.Errorf("admin users require unique nonempty usernames and nonempty passwords")
		}
		users[u.Username] = true
	}
	ids := make(map[string]bool)
	for _, group := range c.Assets.Groups {
		for _, server := range group.Servers {
			if server.ID == "" || ids[server.ID] {
				return fmt.Errorf("asset IDs must be nonempty and globally unique: %q", server.ID)
			}
			ids[server.ID] = true
			if server.Host == "" || server.User == "" || server.Port < 1 || server.Port > 65535 {
				return fmt.Errorf("invalid SSH connection settings for asset %q", server.ID)
			}
			if server.Password == "" && server.PrivateKeyPath == "" {
				return fmt.Errorf("SSH asset %q requires a password or private_key_path", server.ID)
			}
		}
		for _, db := range group.Databases {
			if db.ID == "" || ids[db.ID] {
				return fmt.Errorf("asset IDs must be nonempty and globally unique: %q", db.ID)
			}
			ids[db.ID] = true
			switch db.Type {
			case "mysql", "dm", "redis", "mongo":
			default:
				return fmt.Errorf("unsupported database type for asset %q", db.ID)
			}
			if !(db.Type == "mongo" && db.URI != "") && (db.Host == "" || db.Port < 1 || db.Port > 65535) {
				return fmt.Errorf("invalid database connection settings for asset %q", db.ID)
			}
		}
	}
	return nil
}

// HashPasswords preserves valid bcrypt hashes, including $2b$ and $2y$.
func (c *Config) HashPasswords() error {
	for i, u := range c.Security.AdminUsers {
		if strings.HasPrefix(u.Password, "$2a$") || strings.HasPrefix(u.Password, "$2b$") || strings.HasPrefix(u.Password, "$2y$") {
			if _, err := bcrypt.Cost([]byte(u.Password)); err != nil {
				return fmt.Errorf("invalid bcrypt hash for admin %q", u.Username)
			}
			continue
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash password for admin %q: %w", u.Username, err)
		}
		c.Security.AdminUsers[i].Password = string(hash)
	}
	return nil
}
