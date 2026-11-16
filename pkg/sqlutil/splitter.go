package sqlutil

import "strings"

// SplitStatements handles ordinary SQL strings, quoted identifiers and comments.
// Client commands such as DELIMITER and procedural blocks are not supported.
func SplitStatements(script string) []string {
	var statements []string
	start := 0
	var quote byte
	lineComment, blockComment := false, false
	appendStatement := func(end int) {
		stmt := strings.TrimSpace(script[start:end])
		if FirstKeyword(stmt) != "" {
			statements = append(statements, stmt)
		}
	}
	for i := 0; i < len(script); i++ {
		ch := script[i]
		var next byte
		if i+1 < len(script) {
			next = script[i+1]
		}
		if lineComment {
			if ch == '\n' || ch == '\r' {
				lineComment = false
			}
			continue
		}
		if blockComment {
			if ch == '*' && next == '/' {
				blockComment = false
				i++
			}
			continue
		}
		if quote != 0 {
			if ch == '\\' && quote != '`' && i+1 < len(script) {
				i++ // Consume escapes in pairs, including escaped backslashes.
			} else if ch == quote {
				if next == quote {
					i++
				} else {
					quote = 0
				}
			}
			continue
		}
		switch {
		case ch == '\'' || ch == '"' || ch == '`':
			quote = ch
		case ch == '#':
			lineComment = true
		case ch == '-' && next == '-':
			lineComment = true
			i++
		case ch == '/' && next == '*':
			blockComment = true
			i++
		case ch == ';':
			appendStatement(i)
			start = i + 1
		}
	}
	appendStatement(len(script))
	return statements
}

// FirstKeyword ignores leading comments so commented SELECTs return result sets.
func FirstKeyword(sql string) string {
	for {
		sql = strings.TrimSpace(sql)
		if strings.HasPrefix(sql, "--") || strings.HasPrefix(sql, "#") {
			if end := strings.IndexAny(sql, "\r\n"); end >= 0 {
				sql = sql[end+1:]
				continue
			}
			return ""
		}
		if strings.HasPrefix(sql, "/*!") {
			// MySQL version comments contain executable SQL (common in dumps).
			if end := strings.Index(sql, "*/"); end >= 0 {
				return FirstKeyword(strings.TrimLeft(sql[3:end], "0123456789 "))
			}
			return sql
		}
		if strings.HasPrefix(sql, "/*") {
			if end := strings.Index(sql, "*/"); end >= 0 {
				sql = sql[end+2:]
				continue
			}
			return ""
		}
		break
	}
	end := 0
	for end < len(sql) && ((sql[end] >= 'a' && sql[end] <= 'z') || (sql[end] >= 'A' && sql[end] <= 'Z')) {
		end++
	}
	if end == 0 && sql != "" {
		return sql
	} // Preserve invalid SQL for the DB to reject.
	return strings.ToUpper(sql[:end])
}
