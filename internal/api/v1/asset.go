package v1

import (
	"context"
	"fmt"
	"net/http"
	"opsnexus/internal/service/asset"
	"opsnexus/internal/service/executor"
	"opsnexus/internal/service/metadata"
	"opsnexus/pkg/dbutil"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ListAssets returns the full asset tree.
func ListAssets(c *gin.Context) {
	manager := asset.Get()
	if manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Asset manager not initialized"})
		return
	}
	c.JSON(http.StatusOK, manager.Config)
}

// ListDatabases returns the list of databases for a given connection.
func ListDatabases(c *gin.Context) {
	id := c.Param("id")
	dbConfig, err := asset.Get().GetDatabase(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Construct DSN
	dsn := dbutil.BuildDSN(dbutil.DBType(dbConfig.Type), dbutil.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		Database: dbConfig.Database,
	})

	// Connect
	db, err := dbutil.ConnectGorm(dbutil.DBType(dbConfig.Type), dsn)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to database: " + err.Error()})
		return
	}

	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	db = db.WithContext(ctx)

	// Get Provider
	provider, err := executor.GetRDBMSProvider(dbConfig.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get provider: " + err.Error()})
		return
	}

	// Get Databases
	databases, err := provider.GetDatabases(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list databases: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, databases)
}

// ListTables returns the list of tables for a given database.
func ListTables(c *gin.Context) {
	id := c.Param("id")
	dbName := c.Query("database")
	if dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "database parameter is required"})
		return
	}

	dbConfig, err := asset.Get().GetDatabase(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Construct DSN
	dsn := dbutil.BuildDSN(dbutil.DBType(dbConfig.Type), dbutil.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		Database: dbConfig.Database,
	})

	// Connect
	db, err := dbutil.ConnectGorm(dbutil.DBType(dbConfig.Type), dsn)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to database: " + err.Error()})
		return
	}

	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	db = db.WithContext(ctx)

	// Get Provider
	provider, err := executor.GetRDBMSProvider(dbConfig.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get provider: " + err.Error()})
		return
	}

	// Get Tables
	tables, err := provider.GetTables(db, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list tables: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

// GetTableData returns the data of a specific table.
func GetTableData(c *gin.Context) {
	id := c.Param("id")
	dbName := c.Query("database")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "database and table parameters are required"})
		return
	}

	dbConfig, err := asset.Get().GetDatabase(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Construct DSN
	dsn := dbutil.BuildDSN(dbutil.DBType(dbConfig.Type), dbutil.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		Database: dbConfig.Database,
	})

	// Connect
	db, err := dbutil.ConnectGorm(dbutil.DBType(dbConfig.Type), dsn)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to database: " + err.Error()})
		return
	}

	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	db = db.WithContext(ctx)

	// Get Provider
	provider, err := executor.GetRDBMSProvider(dbConfig.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get provider: " + err.Error()})
		return
	}

	page, pageSize := 1, 50
	if raw := c.Query("page"); raw != "" {
		page, err = strconv.Atoi(raw)
		if err != nil || page < 1 || page > 1000000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "page must be between 1 and 1000000"})
			return
		}
	}
	if raw := c.Query("pageSize"); raw != "" {
		pageSize, err = strconv.Atoi(raw)
		if err != nil || pageSize < 1 || pageSize > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "pageSize must be between 1 and 1000"})
			return
		}
	}
	table := dbutil.QuoteIdentifier(dbutil.DBType(dbConfig.Type), dbName) + "." + dbutil.QuoteIdentifier(dbutil.DBType(dbConfig.Type), tableName)

	// Get Total Count
	var total int64
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s", table)
	if err := db.Raw(countSQL).Scan(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count rows: " + err.Error()})
		return
	}

	// Get Data
	sql := fmt.Sprintf("SELECT * FROM %s", table)
	paginationSQL := provider.GetPaginationSQL(sql, page, pageSize)

	rows, err := db.Raw(paginationSQL).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch data: " + err.Error()})
		return
	}
	defer rows.Close()

	columns, results, err := dbutil.ReadRows(rows, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read rows: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"columns":  columns,
		"data":     results,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GetDatabaseMetadata returns the metadata (tables and columns) for a given database.
func GetDatabaseMetadata(c *gin.Context) {
	id := c.Param("id")
	dbName := c.Query("database")
	if dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "database parameter is required"})
		return
	}

	dbConfig, err := asset.Get().GetDatabase(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Construct DSN
	dsn := dbutil.BuildDSN(dbutil.DBType(dbConfig.Type), dbutil.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		Database: dbConfig.Database,
	})

	// Connect
	db, err := dbutil.ConnectGorm(dbutil.DBType(dbConfig.Type), dsn)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to database: " + err.Error()})
		return
	}

	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	db = db.WithContext(ctx)

	// Get Provider
	provider, err := executor.GetRDBMSProvider(dbConfig.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get provider: " + err.Error()})
		return
	}

	// Get Metadata from Cache
	metaManager := metadata.Get()
	tables, err := metaManager.GetOrLoad(id, dbName, provider, db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metadata: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tables": tables})
}
