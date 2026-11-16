package sqlutil

import (
	"reflect"
	"testing"
)

func TestSplitStatements(t *testing.T) {
	cases := []struct {
		script string
		want   []string
	}{
		{`/*!40101 SET NAMES utf8mb4 */; SELECT 1;`, []string{`/*!40101 SET NAMES utf8mb4 */`, `SELECT 1`}},
		{`SELECT 'a;b'; SELECT 2;`, []string{`SELECT 'a;b'`, `SELECT 2`}},
		{`SELECT 'C:\\'; SELECT 2;`, []string{`SELECT 'C:\\'`, `SELECT 2`}},
		{`SELECT 'it\'s;ok'; SELECT 'it''s;ok';`, []string{`SELECT 'it\'s;ok'`, `SELECT 'it''s;ok'`}},
		{"SELECT `a``;b`; SELECT \"a\"\";b\";", []string{"SELECT `a``;b`", "SELECT \"a\"\";b\""}},
		{"/* comment; */ SELECT 1; -- only a comment;\n# another;", []string{"/* comment; */ SELECT 1"}},
		{"-- comment only\n/* hello */", nil},
	}
	for _, tc := range cases {
		if got := SplitStatements(tc.script); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%q: got %#v want %#v", tc.script, got, tc.want)
		}
	}
	if got := FirstKeyword(" /* hint */ -- comment\n select 1"); got != "SELECT" {
		t.Fatal(got)
	}
}
