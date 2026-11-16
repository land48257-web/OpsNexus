package dbutil

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	dameng "opsnexus/pkg/gormdm"

	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type DBType string

const (
	TypeMySQL DBType = "mysql"
	TypeDM    DBType = "dm" // Dameng
	TypeRedis DBType = "redis"
	TypeMongo DBType = "mongo"
)

// DBConfig holds the connection configuration
type DBConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

// BuildDSN constructs the DSN string based on the database type.
func BuildDSN(dbType DBType, config DBConfig) string {
	switch dbType {
	case TypeMySQL:
		cfg := mysqldriver.NewConfig()
		cfg.User, cfg.Passwd = config.User, config.Password
		cfg.Net, cfg.Addr = "tcp", net.JoinHostPort(config.Host, strconv.Itoa(config.Port))
		cfg.DBName = config.Database
		cfg.ParseTime = true
		cfg.Loc = time.Local
		cfg.Params = map[string]string{"charset": "utf8mb4"}
		cfg.Timeout = 10 * time.Second
		return cfg.FormatDSN()
	case TypeDM:
		u := url.URL{Scheme: "dm", User: url.UserPassword(config.User, config.Password), Host: net.JoinHostPort(config.Host, strconv.Itoa(config.Port))}
		q := u.Query()
		q.Set("connectTimeout", "10000")
		if config.Database != "" {
			q.Set("schema", config.Database)
		}
		u.RawQuery = q.Encode()
		return u.String()
	default:
		return ""
	}
}

// ConnectGorm establishes a connection to a relational database (MySQL/DM).
func ConnectGorm(dbType DBType, dsn string) (*gorm.DB, error) {
	var dialector gorm.Dialector

	switch dbType {
	case TypeMySQL:
		dialector = mysql.Open(dsn)
	case TypeDM:
		dialector = dameng.Open(dsn)
	default:
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		PrepareStmt: true,
	})
	if err != nil {
		if db != nil && db.ConnPool != nil {
			if sqlDB, dbErr := db.DB(); dbErr == nil {
				_ = sqlDB.Close()
			}
		}
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Connection Pool Settings
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// ConnectRedis establishes a connection to Redis.
func ConnectRedis(addr, password string, db int) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, err
	}

	return rdb, nil
}

// ConnectMongo establishes a connection to MongoDB.
func ConnectMongo(uri string) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}

	return client, nil
}

// MongoURI supports the same host/port credentials as other asset types.
func MongoURI(config DBConfig) string {
	u := url.URL{Scheme: "mongodb", Host: net.JoinHostPort(config.Host, strconv.Itoa(config.Port)), Path: "/" + config.Database}
	if config.User != "" {
		u.User = url.UserPassword(config.User, config.Password)
	}
	return u.String()
}

// QuoteIdentifier quotes one identifier component; dots are part of its name.
func QuoteIdentifier(dbType DBType, name string) string {
	quote := "`"
	if dbType == TypeDM {
		quote = "\""
	}
	return quote + strings.ReplaceAll(name, quote, quote+quote) + quote
}
