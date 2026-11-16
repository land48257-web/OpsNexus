package mongo

import (
	"go.mongodb.org/mongo-driver/bson"
	"strings"
	"testing"
)

func TestParseArgsEscapedQuotesAndCommas(t *testing.T) {
	args, err := parseArgs(`{"name":"it's \\\"quoted, text"}, {"$set":{"a":[1,2]}}`)
	if err != nil || len(args) != 2 {
		t.Fatalf("args=%v err=%v", args, err)
	}
	for _, arg := range args {
		if _, err := parseBSON(arg); err != nil {
			t.Fatal(err)
		}
	}
	for _, invalid := range []string{`{"x":"unterminated}`, `{x:1}`, `{},`, `}{`} {
		if _, err := parseArgs(invalid); err == nil {
			t.Errorf("accepted %q", invalid)
		}
	}
}

func TestPipelinePreservesSortOrderAndBSONTypes(t *testing.T) {
	var pipeline []bson.D
	err := bson.UnmarshalExtJSON([]byte(`[{"$sort":{"z":1,"a":-1}},{"$match":{"_id":{"$oid":"507f1f77bcf86cd799439011"}}}]`), false, &pipeline)
	if err != nil {
		t.Fatal(err)
	}
	sort := pipeline[0][0].Value.(bson.D)
	if sort[0].Key != "z" || sort[1].Key != "a" {
		t.Fatal("sort order changed")
	}
}

func TestShellOutputIsBounded(t *testing.T) {
	buffer := &boundedOutput{}
	if _, err := buffer.Write([]byte(strings.Repeat("x", 2*1024*1024))); err == nil {
		t.Fatal("expected output limit")
	}
	if buffer.Len() != 1024*1024 {
		t.Fatal(buffer.Len())
	}
}
