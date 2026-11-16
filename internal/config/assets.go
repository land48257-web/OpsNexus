package config

type AssetConfig struct {
	Groups []Group `yaml:"groups" json:"groups"`
}

type Group struct {
	Name      string     `yaml:"name" json:"name"`
	Servers   []Server   `yaml:"servers" json:"servers"`
	Databases []Database `yaml:"databases" json:"databases"`
}

type Server struct {
	ID             string `yaml:"id" json:"id"`
	Name           string `yaml:"name" json:"name"`
	Host           string `yaml:"host" json:"host"`
	Port           int    `yaml:"port" json:"port"`
	User           string `yaml:"user" json:"user"`
	Password       string `yaml:"password" json:"-"` // Do not expose password in JSON
	PrivateKeyPath string `mapstructure:"private_key_path" yaml:"private_key_path" json:"-"`
}

type Database struct {
	ID       string `yaml:"id" json:"id"`
	Name     string `yaml:"name" json:"name"`
	Type     string `yaml:"type" json:"type"` // mysql, redis, mongo, dm
	Host     string `yaml:"host" json:"host,omitempty"`
	Port     int    `yaml:"port" json:"port,omitempty"`
	User     string `yaml:"user" json:"user,omitempty"`
	Password string `yaml:"password" json:"-"` // Do not expose password
	Database string `yaml:"database" json:"database,omitempty"`
	URI      string `yaml:"uri" json:"-"` // Connection URIs may contain credentials.
}
