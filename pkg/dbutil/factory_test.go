package dbutil

import (
	"errors"
	"net/url"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-sql-driver/mysql"
)

func TestConnectionStringsPreserveSpecialCharacters(t *testing.T) {
	cfg := DBConfig{Host: "::1", Port: 3306, User: "user", Password: "p@:/?#&", Database: "db /?&"}
	parsed, err := mysql.ParseDSN(BuildDSN(TypeMySQL, cfg))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Passwd != cfg.Password || parsed.DBName != cfg.Database || parsed.Addr != "[::1]:3306" {
		t.Fatalf("incorrect MySQL DSN: %+v", parsed)
	}
	u, err := url.Parse(BuildDSN(TypeDM, cfg))
	if err != nil {
		t.Fatal(err)
	}
	password, _ := u.User.Password()
	if password != cfg.Password || u.Query().Get("schema") != cfg.Database {
		t.Fatal("incorrect DM DSN")
	}
	u, err = url.Parse(MongoURI(cfg))
	if err != nil {
		t.Fatal(err)
	}
	password, _ = u.User.Password()
	if password != cfg.Password || u.Path != "/"+cfg.Database {
		t.Fatal("incorrect Mongo URI")
	}
}

func TestIdentifierQuoting(t *testing.T) {
	if got := QuoteIdentifier(TypeMySQL, "a`b.c"); got != "`a``b.c`" {
		t.Fatal(got)
	}
	if got := QuoteIdentifier(TypeDM, "a\"b.c"); got != "\"a\"\"b.c\"" {
		t.Fatal(got)
	}
}

func TestReadRowsReportsIterationError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("ok").AddRow("bad").RowError(1, errors.New("connection lost")))
	rows, err := db.Query("SELECT")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	if _, _, err := ReadRows(rows, 1000); err == nil {
		t.Fatal("partial query reported success")
	}
}

func TestReadRowsPreservesDuplicateColumnsAndLargeIntegers(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows([]string{"value", "value", "value (2)"}).AddRow(int64(9007199254740993), 2, 3))
	rows, err := db.Query("SELECT")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, data, err := ReadRows(rows, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if len(data[0]) != 3 || columns[1] != "value (3)" || data[0]["value"] != "9007199254740993" || data[0]["value (3)"] != int64(2) {
		t.Fatalf("values changed: columns=%v data=%v", columns, data)
	}
}
