package mongoutil

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"

	"go.mongodb.org/mongo-driver/bson"
)

// BSONToExtJSON delegates BSON type handling to the driver. Int64 values remain
// $numberLong strings so browser JSON parsing cannot silently round them.
func BSONToExtJSON(doc bson.M) (map[string]interface{}, error) {
	data, err := bson.MarshalExtJSON(doc, true, false)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return relaxNumbers(result).(map[string]interface{}), nil
}

func relaxNumbers(value interface{}) interface{} {
	switch v := value.(type) {
	case map[string]interface{}:
		if len(v) == 1 {
			if s, ok := v["$numberInt"].(string); ok {
				if n, err := strconv.ParseInt(s, 10, 32); err == nil {
					return int32(n)
				}
			}
			if s, ok := v["$numberDouble"].(string); ok {
				// Integral doubles need the marker: JSON "1" would decode as int32.
				if n, err := strconv.ParseFloat(s, 64); err == nil && !math.IsNaN(n) && !math.IsInf(n, 0) && math.Trunc(n) != n {
					return n
				}
			}
		}
		for key, child := range v {
			v[key] = relaxNumbers(child)
		}
	case []interface{}:
		for i, child := range v {
			v[i] = relaxNumbers(child)
		}
	}
	return value
}

func ExtJSONToBSON(data map[string]interface{}) (bson.M, error) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	return JSONToBSONDocument(encoded)
}

func BSONDocumentsToJSON(docs []bson.M) ([]byte, error) {
	converted := make([]map[string]interface{}, len(docs))
	for i, doc := range docs {
		var err error
		converted[i], err = BSONToExtJSON(doc)
		if err != nil {
			return nil, err
		}
	}
	return json.Marshal(converted)
}

func JSONToBSONDocument(data []byte) (bson.M, error) {
	var doc bson.M
	if err := bson.UnmarshalExtJSON(data, false, &doc); err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, fmt.Errorf("expected a JSON document")
	}
	return doc, nil
}
