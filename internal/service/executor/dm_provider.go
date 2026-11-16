package executor

import (
	"fmt"
	"opsnexus/internal/model"

	"gorm.io/gorm"
)

type DMProvider struct{}

func (p *DMProvider) GetDatabases(db *gorm.DB) ([]string, error) {
	var schemas []string
	// In Dameng, schemas are roughly equivalent to databases in MySQL context for organization.
	// We query distinct owners or schemas.
	// Usually `SELECT DISTINCT OWNER FROM ALL_TABLES` or `SELECT USERNAME FROM DBA_USERS`
	// But `v$database` or `v$instance` gives DB info.
	// For the schema selector, we usually want the list of Schemas.
	// Let's use `SELECT DISTINCT owner FROM all_tables` as a starting point,
	// or better `SELECT username FROM dba_users` if we have permission, but `all_users` is safer.
	// However, standard practice for "Databases" dropdown in DM tools is often just the current DB or Schemas.
	// Let's return Schemas.
	if err := db.Raw("SELECT username FROM all_users ORDER BY username").Scan(&schemas).Error; err != nil {
		return nil, err
	}
	return schemas, nil
}

func (p *DMProvider) GetTables(db *gorm.DB, dbName string) ([]TableInfo, error) {
	var tables []TableInfo
	// DM specific query: ALL_TABLES
	// dbName is treated as the Schema name (Owner)
	// Note: DM object names are usually uppercase.
	query := `
		SELECT 
			T.TABLE_NAME as "name", 
			C.COMMENTS as "comment", 
			T.NUM_ROWS as "rows"
		FROM ALL_TABLES T
		LEFT JOIN ALL_TAB_COMMENTS C ON T.OWNER = C.OWNER AND T.TABLE_NAME = C.TABLE_NAME AND C.TABLE_TYPE = 'TABLE'
		WHERE T.OWNER = ?
	`
	if err := db.Raw(query, dbName).Scan(&tables).Error; err != nil {
		return nil, err
	}
	return tables, nil
}

func (p *DMProvider) GetColumns(db *gorm.DB, dbName, tableName string) ([]ColumnInfo, error) {
	var columns []ColumnInfo
	// DM specific query: ALL_TAB_COLUMNS joined with ALL_COL_COMMENTS
	query := `
		SELECT 
			C.COLUMN_NAME as "name", 
			C.DATA_TYPE as "type", 
			C.NULLABLE as "nullable", 
			C.DATA_DEFAULT as "default_value", 
			CC.COMMENTS as "comment",
			0 as "is_primary_key"
		FROM ALL_TAB_COLUMNS C
		LEFT JOIN ALL_COL_COMMENTS CC ON C.OWNER = CC.OWNER AND C.TABLE_NAME = CC.TABLE_NAME AND C.COLUMN_NAME = CC.COLUMN_NAME
		WHERE C.OWNER = ? AND C.TABLE_NAME = ?
		ORDER BY C.COLUMN_ID
	`

	if err := db.Raw(query, dbName, tableName).Scan(&columns).Error; err != nil {
		return nil, err
	}
	return columns, nil
}

func (p *DMProvider) GetPaginationSQL(sql string, page, size int) string {
	offset := (page - 1) * size
	return fmt.Sprintf("%s LIMIT %d OFFSET %d", sql, size, offset)
}

func (p *DMProvider) ExecuteBatch(db *gorm.DB, script string, stopOnError bool, resultChan chan<- model.ExecResult) {
	ExecuteGenericBatch(db, script, stopOnError, resultChan)
}
