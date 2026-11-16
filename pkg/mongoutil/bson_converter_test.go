package mongoutil

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestExtendedJSONRoundTrip(t *testing.T) {
	decimal, _ := primitive.ParseDecimal128("12345678901234567890.123")
	doc := bson.M{
		"_id": primitive.NewObjectID(), "date": primitive.DateTime(1700000000123),
		"ts":      primitive.Timestamp{T: 1234567890, I: 42},
		"binary":  primitive.Binary{Subtype: 0x80, Data: []byte{0, 1, 2, 255}},
		"decimal": decimal, "regex": primitive.Regex{Pattern: "^hello", Options: "i"},
		"long": int64(9007199254740993), "small": int32(4), "double": 1.5,
		"wholeDouble": float64(1),
		"nested":      bson.M{"list": bson.A{primitive.DateTime(42), primitive.NewObjectID()}},
	}
	encoded, err := BSONToExtJSON(doc)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"$numberLong":"9007199254740993"`) {
		t.Fatal("int64 precision lost")
	}
	result, err := JSONToBSONDocument(data)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(doc, result) {
		t.Fatalf("round trip changed BSON:\n%#v\n%#v", doc, result)
	}
}

func TestInvalidExtendedJSONRejected(t *testing.T) {
	for _, value := range []string{
		`{"date":{"$date":{"$numberLong":"invalid"}}}`,
		`{"ts":{"$timestamp":{"t":-1,"i":1}}}`,
		`{"_id":{"$oid":"bad"}}`,
		`null`,
	} {
		if _, err := JSONToBSONDocument([]byte(value)); err == nil {
			t.Errorf("invalid value accepted: %s", value)
		}
	}
}

func TestOrderedNestedDocument(t *testing.T) {
	result, err := BSONToExtJSON(bson.M{"nested": bson.D{{Key: "date", Value: primitive.DateTime(1)}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := result["nested"].(map[string]interface{}); !ok {
		t.Fatal("ordered document encoded as an array")
	}
}
