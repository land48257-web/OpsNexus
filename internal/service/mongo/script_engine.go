package mongo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"opsnexus/internal/service/asset"
	"opsnexus/pkg/dbutil"
	"opsnexus/pkg/mongoutil"
	"os/exec"
	"regexp"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ScriptResult represents the result of a script execution
type ScriptResult struct {
	Type  string      `json:"type"` // "cursor", "document", "number", "result", "text", "error"
	Data  interface{} `json:"data"`
	Total int64       `json:"total,omitempty"`
	Count int64       `json:"count,omitempty"` // For update/delete counts
	Error string      `json:"error,omitempty"`
}

// ExecuteScript parses and executes a MongoDB shell-like script
// Supported syntax: db.collection.method(args...)
func (m *Manager) ExecuteScript(ctx context.Context, assetID, database, script, mode string) (*ScriptResult, error) {
	if mode == "shell" {
		return m.executeShellScript(ctx, assetID, database, script)
	}

	script = strings.TrimSuffix(strings.TrimSpace(script), ";")
	if script == "db.getCollectionNames()" {
		names, err := m.ListCollections(ctx, assetID, database)
		if err != nil {
			return nil, err
		}
		return &ScriptResult{Type: "result", Data: names}, nil
	}

	// 1. Basic parsing using Regex
	// Matches: db.collectionName.methodName(args)
	re := regexp.MustCompile(`(?s)^db\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\((.*)\)$`)
	matches := re.FindStringSubmatch(strings.TrimSuffix(strings.TrimSpace(script), ";"))

	if len(matches) != 4 {
		return nil, fmt.Errorf("invalid script format. Expected: db.collection.method(args)")
	}

	collectionName := matches[1]
	methodName := matches[2]
	argsStr := matches[3]

	// 2. Parse arguments
	args, err := parseArgs(argsStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse arguments: %w", err)
	}

	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collectionName)

	// 3. Dispatch method
	switch methodName {
	case "find":
		return m.handleFind(ctx, coll, args)
	case "findOne":
		return m.handleFindOne(ctx, coll, args)
	case "aggregate":
		return m.handleAggregate(ctx, coll, args)
	case "count", "countDocuments":
		return m.handleCount(ctx, coll, args)
	case "insertOne":
		return m.handleInsertOne(ctx, coll, args)
	case "updateOne":
		return m.handleUpdateOne(ctx, coll, args)
	case "updateMany":
		return m.handleUpdateMany(ctx, coll, args)
	case "deleteOne":
		return m.handleDeleteOne(ctx, coll, args)
	case "deleteMany":
		return m.handleDeleteMany(ctx, coll, args)
	default:
		return nil, fmt.Errorf("unsupported method: %s", methodName)
	}
}

func (m *Manager) executeShellScript(ctx context.Context, assetID, database, script string) (*ScriptResult, error) {
	// 1. Check capabilities
	caps := GetProber().GetCapabilities()
	if !caps.Available {
		return nil, fmt.Errorf("mongosh not available")
	}

	// 2. Get connection info
	dbConfig, err := asset.Get().GetDatabase(assetID)
	if err != nil {
		return nil, err
	}

	if dbConfig.Type != "mongo" {
		return nil, fmt.Errorf("asset is not a MongoDB database")
	}
	connStr := dbConfig.URI
	if connStr == "" {
		connStr = dbutil.MongoURI(dbutil.DBConfig{Host: dbConfig.Host, Port: dbConfig.Port, User: dbConfig.User, Password: dbConfig.Password, Database: dbConfig.Database})
	}
	dbJSON, _ := json.Marshal(database)
	fullScript := fmt.Sprintf("db = db.getSiblingDB(%s);\n%s", dbJSON, script)
	ctx, cancel := m.withTimeout(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, caps.Path, connStr, "--eval", fullScript, "--quiet")
	outputBuffer := &boundedOutput{}
	cmd.Stdout, cmd.Stderr = outputBuffer, outputBuffer
	err = cmd.Run()
	output := outputBuffer.Bytes()

	if err != nil {
		return &ScriptResult{
			Type:  "error",
			Data:  string(output), // mongosh often prints errors to stdout/stderr
			Error: err.Error(),
		}, nil
	}

	return &ScriptResult{
		Type: "text",
		Data: string(output),
	}, nil
}

// parseArgs splits arguments string by comma, respecting nested braces/brackets
// This is a simplified parser and assumes valid JSON-like inputs
func parseArgs(argsStr string) ([]string, error) {
	if strings.TrimSpace(argsStr) == "" {
		return nil, nil
	}
	var values []json.RawMessage
	if err := json.Unmarshal([]byte("["+argsStr+"]"), &values); err != nil {
		return nil, fmt.Errorf("arguments must be valid JSON/Extended JSON: %w", err)
	}
	args := make([]string, len(values))
	for i, value := range values {
		args[i] = string(value)
	}
	return args, nil
}

func parseBSON(jsonStr string) (bson.M, error) {
	if strings.TrimSpace(jsonStr) == "" {
		return bson.M{}, nil
	}
	return mongoutil.JSONToBSONDocument([]byte(jsonStr))
}

// Limit captured shell output without letting an unbounded process fill memory.
type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	const max = 1024 * 1024
	if len(p) > max-b.Len() {
		n, _ := b.Buffer.Write(p[:max-b.Len()])
		return n, io.ErrShortBuffer
	}
	return b.Buffer.Write(p)
}

func (m *Manager) handleFind(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	filter := bson.M{}
	var err error
	if len(args) > 0 {
		filter, err = parseBSON(args[0])
		if err != nil {
			return nil, err
		}
	}

	findOpts := options.Find().SetLimit(50)
	if len(args) > 1 {
		projection, err := parseBSON(args[1])
		if err != nil {
			return nil, err
		}
		findOpts.SetProjection(projection)
	}
	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}

	extDocs, err := m.ConvertDocumentsToExtJSON(docs)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type:  "cursor",
		Data:  extDocs,
		Total: int64(len(extDocs)), // This is just page size, not total count
	}, nil
}

func (m *Manager) handleFindOne(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	filter := bson.M{}
	var err error
	if len(args) > 0 {
		filter, err = parseBSON(args[0])
		if err != nil {
			return nil, err
		}
	}

	var doc bson.M
	err = coll.FindOne(ctx, filter).Decode(&doc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return &ScriptResult{Type: "document", Data: nil}, nil
		}
		return nil, err
	}

	extDocs, err := m.ConvertDocumentsToExtJSON([]bson.M{doc})
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type: "document",
		Data: extDocs[0],
	}, nil
}

func (m *Manager) handleAggregate(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("aggregate requires pipeline argument")
	}

	var pipeline []bson.D
	if err := bson.UnmarshalExtJSON([]byte(args[0]), false, &pipeline); err != nil || pipeline == nil {
		return nil, fmt.Errorf("invalid pipeline JSON")
	}
	pipeline = append(pipeline, bson.D{{Key: "$limit", Value: 1000}})

	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}

	extDocs, err := m.ConvertDocumentsToExtJSON(docs)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type: "cursor",
		Data: extDocs,
	}, nil
}

func (m *Manager) handleCount(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	filter := bson.M{}
	var err error
	if len(args) > 0 {
		filter, err = parseBSON(args[0])
		if err != nil {
			return nil, err
		}
	}

	count, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type: "number",
		Data: count,
	}, nil
}

func (m *Manager) handleInsertOne(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("insertOne requires document argument")
	}

	doc, err := parseBSON(args[0])
	if err != nil {
		return nil, err
	}

	res, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type: "result",
		Data: res,
	}, nil
}

func (m *Manager) handleUpdateOne(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("updateOne requires filter and update arguments")
	}

	filter, err := parseBSON(args[0])
	if err != nil {
		return nil, err
	}

	update, err := parseBSON(args[1])
	if err != nil {
		return nil, err
	}

	res, err := coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type:  "result",
		Data:  res,
		Count: res.ModifiedCount,
	}, nil
}

func (m *Manager) handleUpdateMany(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("updateMany requires filter and update arguments")
	}

	filter, err := parseBSON(args[0])
	if err != nil {
		return nil, err
	}

	update, err := parseBSON(args[1])
	if err != nil {
		return nil, err
	}

	res, err := coll.UpdateMany(ctx, filter, update)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type:  "result",
		Data:  res,
		Count: res.ModifiedCount,
	}, nil
}

func (m *Manager) handleDeleteOne(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("deleteOne requires filter argument")
	}

	filter, err := parseBSON(args[0])
	if err != nil {
		return nil, err
	}

	res, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type:  "result",
		Data:  res,
		Count: res.DeletedCount,
	}, nil
}

func (m *Manager) handleDeleteMany(ctx context.Context, coll *mongo.Collection, args []string) (*ScriptResult, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("deleteMany requires filter argument")
	}

	filter, err := parseBSON(args[0])
	if err != nil {
		return nil, err
	}

	res, err := coll.DeleteMany(ctx, filter)
	if err != nil {
		return nil, err
	}

	return &ScriptResult{
		Type:  "result",
		Data:  res,
		Count: res.DeletedCount,
	}, nil
}
