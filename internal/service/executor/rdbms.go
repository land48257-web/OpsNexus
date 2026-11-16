package executor

import (
	"fmt"
	"opsnexus/internal/model"
	"opsnexus/pkg/dbutil"
	"opsnexus/pkg/sqlutil"
	"time"

	"gorm.io/gorm"
)

// DBConfig holds the connection configuration
type DBConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
	Schema   string // Added for DM
}

// TableInfo represents table metadata
type TableInfo struct {
	Name    string `json:"name"`
	Comment string `json:"comment"`
	Rows    int64  `json:"rows"` // Estimated row count
}

// ColumnInfo represents column metadata
type ColumnInfo struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Nullable     string `json:"nullable"` // "YES" or "NO"
	DefaultValue string `json:"default_value"`
	Comment      string `json:"comment"`
	IsPrimaryKey bool   `json:"is_primary_key"`
}

// RDBMSProvider defines the common interface for Relational Databases (MySQL, DM, etc.)
type RDBMSProvider interface {
	// GetTables returns the list of tables in the current database/schema
	GetTables(db *gorm.DB, dbName string) ([]TableInfo, error)

	// GetColumns returns the columns of a specific table
	GetColumns(db *gorm.DB, dbName, tableName string) ([]ColumnInfo, error)

	// GetPaginationSQL returns the SQL for pagination (LIMIT/OFFSET or ROWNUM)
	GetPaginationSQL(sql string, page, size int) string

	// GetDatabases returns database/schema names.
	GetDatabases(db *gorm.DB) ([]string, error)

	ExecuteBatch(db *gorm.DB, script string, stopOnError bool, resultChan chan<- model.ExecResult)
}

// GetRDBMSProvider returns the appropriate provider based on the database type
func GetRDBMSProvider(dbType string) (RDBMSProvider, error) {
	switch dbType {
	case "mysql":
		return &MySQLProvider{}, nil
	case "dm":
		return &DMProvider{}, nil
	default:
		return nil, fmt.Errorf("unsupported RDBMS type: %s", dbType)
	}
}

// ExecuteGenericBatch streams statement outcomes and stops when the client leaves.
// Database DDL may implicitly commit; the transaction cannot undo such statements.
func ExecuteGenericBatch(db *gorm.DB, script string, stopOnError bool, resultChan chan<- model.ExecResult) {
	defer close(resultChan)
	ctx := db.Statement.Context
	send := func(res model.ExecResult) bool {
		if ctx.Err() != nil {
			return false
		}
		select {
		case resultChan <- res:
			return true
		case <-ctx.Done():
			return false
		}
	}
	statements := sqlutil.SplitStatements(script)
	if len(statements) == 0 {
		send(model.ExecResult{Kind: "transaction", Status: "success", Statement: "EMPTY"})
		return
	}
	tx := db.Begin()
	if tx.Error != nil {
		send(model.ExecResult{Kind: "transaction", Status: "error", Error: "Failed to start transaction: " + tx.Error.Error()})
		return
	}
	defer tx.Rollback()
	for i, stmt := range statements {
		if ctx.Err() != nil {
			return
		}
		start := time.Now()
		res := model.ExecResult{Sequence: i + 1, Statement: stmt, Status: "success"}
		var err error
		keyword := sqlutil.FirstKeyword(stmt)
		isQuery := keyword == "SELECT" || keyword == "SHOW" || keyword == "DESC" || keyword == "DESCRIBE" || keyword == "EXPLAIN" || keyword == "WITH"
		if isQuery {
			rows, queryErr := tx.Raw(stmt).Rows()
			err = queryErr
			if err == nil {
				var data []map[string]interface{}
				res.Columns, data, err = dbutil.ReadRows(rows, 1000)
				closeErr := rows.Close()
				if err == nil {
					err = closeErr
				}
				res.Data, res.RowsAffected = data, int64(len(data))
			}
		} else {
			result := tx.Exec(stmt)
			err, res.RowsAffected = result.Error, result.RowsAffected
		}
		res.TimeCostMs = time.Since(start).Milliseconds()
		if err != nil {
			res.Status, res.Error = "error", err.Error()
		}
		if !send(res) {
			return
		}
		if err != nil && stopOnError {
			rollbackErr := tx.Rollback().Error
			message := "Batch stopped; transaction rolled back (implicitly committed DDL cannot be undone)"
			if rollbackErr != nil {
				message = "Rollback failed: " + rollbackErr.Error()
			}
			send(model.ExecResult{Kind: "transaction", Status: "error", Statement: "ROLLBACK", Error: message})
			return
		}
	}
	if ctx.Err() != nil {
		return
	}
	if err := tx.Commit().Error; err != nil {
		send(model.ExecResult{Kind: "transaction", Status: "error", Statement: "COMMIT", Error: "Transaction commit failed: " + err.Error()})
	} else {
		send(model.ExecResult{Kind: "transaction", Status: "success", Statement: "COMMIT"})
	}
}
