package executor

import (
	"fmt"
	"opsnexus/internal/model"

	"gorm.io/gorm"
)

// MySQLProvider implements RDBMSProvider for MySQL
type MySQLProvider struct{}

func (p *MySQLProvider) GetDatabases(db *gorm.DB) ([]string, error) {
	var databases []string
	err := db.Raw("SHOW DATABASES").Scan(&databases).Error
	return databases, err
}

func (p *MySQLProvider) GetTables(db *gorm.DB, dbName string) ([]TableInfo, error) {
	var tables []TableInfo
	// Switch database context if needed or query information_schema
	// Querying information_schema is safer and doesn't change connection state
	query := `
		SELECT 
			TABLE_NAME as name, 
			TABLE_COMMENT as comment, 
			TABLE_ROWS as ` + "`rows`" + `
		FROM information_schema.TABLES 
		WHERE TABLE_SCHEMA = ?
	`
	// Note: TABLE_ROWS is an estimate for InnoDB
	err := db.Raw(query, dbName).Scan(&tables).Error
	return tables, err
}

func (p *MySQLProvider) GetColumns(db *gorm.DB, dbName, tableName string) ([]ColumnInfo, error) {
	var columns []ColumnInfo
	query := `
		SELECT 
			COLUMN_NAME as name, 
			DATA_TYPE as type, 
			IS_NULLABLE as nullable, 
			COLUMN_DEFAULT as default_value, 
			COLUMN_COMMENT as comment,
			IF(COLUMN_KEY = 'PRI', 1, 0) as is_primary_key
		FROM information_schema.COLUMNS 
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION
	`
	err := db.Raw(query, dbName, tableName).Scan(&columns).Error
	return columns, err
}

func (p *MySQLProvider) GetPaginationSQL(sql string, page, size int) string {
	offset := (page - 1) * size
	return fmt.Sprintf("%s LIMIT %d OFFSET %d", sql, size, offset)
}

func (p *MySQLProvider) ExecuteBatch(db *gorm.DB, script string, stopOnError bool, resultChan chan<- model.ExecResult) {
	ExecuteGenericBatch(db, script, stopOnError, resultChan)
}
