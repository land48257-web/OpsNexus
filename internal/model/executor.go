package model

// BatchExecRequest defines the payload for executing multiple SQL/NoSQL commands.
type BatchExecRequest struct {
	ConnectionID string `json:"connection_id" binding:"required"` // ID of the saved connection config
	Type         string `json:"type" binding:"required,oneof=mysql dm mongo redis"`
	Database     string `json:"database"`      // Target database name (optional override)
	Script       string `json:"script"`        // The raw script content (SQL or JSON)
	StopOnError  bool   `json:"stop_on_error"` // Whether to rollback/stop on first error
}

// ExecResult represents the streaming result of a single command execution.
type ExecResult struct {
	Kind         string   `json:"kind,omitempty"` // "transaction" identifies the final batch outcome.
	Sequence     int      `json:"sequence"`       // Order of the statement (1-based)
	Statement    string   `json:"statement"`      // The actual statement executed
	Status       string   `json:"status"`         // "success" or "error"
	RowsAffected int64    `json:"rows_affected"`  // Number of rows affected
	TimeCostMs   int64    `json:"time_cost_ms"`   // Execution time in milliseconds
	Error        string   `json:"error,omitempty"`
	Columns      []string `json:"columns,omitempty"` // Ordered column names
	Data         any      `json:"data,omitempty"`    // Result set (limited rows for preview)
}
