package v1

import (
	"context"
	"io"
	"net/http"
	"opsnexus/internal/model"
	"opsnexus/internal/service/asset"
	"opsnexus/internal/service/executor"
	"opsnexus/internal/service/metadata"
	"opsnexus/pkg/dbutil"
	"opsnexus/pkg/sqlutil"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ExecuteBatch handles the batch execution request.
func ExecuteBatch(c *gin.Context) {
	var req model.BatchExecRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Get Database Config
	dbConfig, err := asset.Get().GetDatabase(req.ConnectionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if req.Type != dbConfig.Type || (dbConfig.Type != "mysql" && dbConfig.Type != "dm") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request type must match the MySQL/DM asset type"})
		return
	}
	if strings.TrimSpace(req.Script) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "script is required"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()
	// Construct DSN
	dsn := dbutil.BuildDSN(dbutil.DBType(req.Type), dbutil.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		Database: dbConfig.Database,
	})

	// Override database if provided in request
	if req.Database != "" {
		dsn = dbutil.BuildDSN(dbutil.DBType(req.Type), dbutil.DBConfig{
			Host:     dbConfig.Host,
			Port:     dbConfig.Port,
			User:     dbConfig.User,
			Password: dbConfig.Password,
			Database: req.Database,
		})
	}

	db, err := dbutil.ConnectGorm(dbutil.DBType(req.Type), dsn)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to database: " + err.Error()})
		return
	}

	// Close DB connection when done (or rely on pool, but for ad-hoc script execution, we might want to be careful)
	// dbutil.ConnectGorm returns a *gorm.DB which manages a pool.
	// Since we are creating a new pool for every request (which is not ideal for high load but fine for this tool),
	// we should probably close the underlying sql.DB.
	sqlDB, _ := db.DB()
	defer func() { cancel(); _ = sqlDB.Close() }()
	db = db.WithContext(ctx)

	// 3. Get Provider
	provider, err := executor.GetRDBMSProvider(req.Type)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 4. Execute
	// Create a channel for streaming results
	resultChan := make(chan model.ExecResult)

	// Start execution in goroutine
	go func() {
		defer func() {
			for _, stmt := range sqlutil.SplitStatements(req.Script) {
				switch sqlutil.FirstKeyword(stmt) {
				case "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT":
					metadata.Get().InvalidateAsset(req.ConnectionID)
					return
				}
			}
		}()
		provider.ExecuteBatch(db, req.Script, req.StopOnError, resultChan)
	}()

	// 4. Stream Results
	c.Header("X-Accel-Buffering", "no")
	c.Header("Cache-Control", "no-cache")
	c.Stream(func(w io.Writer) bool {
		select {
		case <-ctx.Done():
			c.SSEvent("message", model.ExecResult{Kind: "transaction", Status: "error", Error: "Execution cancelled or timed out; verify database state before retrying"})
			return false
		case res, ok := <-resultChan:
			if !ok {
				return false
			}
			c.SSEvent("message", res)
			return true
		}
	})
}
