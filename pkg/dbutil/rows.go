package dbutil

import (
	"database/sql"
	"fmt"
	"strconv"
)

// ReadRows preserves column order and never reports a partially failed query as
// successful. Callers own rows.Close. A positive limit bounds preview memory.
func ReadRows(rows *sql.Rows, limit int) ([]string, []map[string]interface{}, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}
	columns = append([]string(nil), columns...)
	// A map cannot represent duplicate column labels. Preserve every value by
	// disambiguating repeated labels without shadowing a real column name.
	reserved := make(map[string]bool, len(columns))
	used := make(map[string]bool, len(columns))
	for _, name := range columns {
		reserved[name] = true
	}
	for i, name := range columns {
		if used[name] {
			for suffix := 2; ; suffix++ {
				candidate := fmt.Sprintf("%s (%d)", name, suffix)
				if !reserved[candidate] && !used[candidate] {
					columns[i] = candidate
					break
				}
			}
		}
		used[columns[i]] = true
	}
	results := make([]map[string]interface{}, 0)
	values := make([]interface{}, len(columns))
	ptrs := make([]interface{}, len(columns))
	for i := range ptrs {
		ptrs[i] = &values[i]
	}
	for (limit <= 0 || len(results) < limit) && rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return nil, nil, err
		}
		entry := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			switch value := values[i].(type) {
			case []byte:
				entry[col] = string(value)
			case int64:
				if value > 1<<53-1 || value < -(1<<53-1) {
					entry[col] = strconv.FormatInt(value, 10)
				} else {
					entry[col] = value
				}
			default:
				entry[col] = value
			}
		}
		results = append(results, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	return columns, results, nil
}
