package mongo

import (
	"context"
	"fmt"
	"net/url"
	"opsnexus/internal/service/asset"
	"opsnexus/pkg/dbutil"
	"opsnexus/pkg/mongoutil"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Manager struct {
	clients map[string]*mongo.Client
	mu      sync.RWMutex
}

var (
	manager *Manager
	once    sync.Once
)

func GetManager() *Manager {
	once.Do(func() {
		manager = &Manager{
			clients: make(map[string]*mongo.Client),
		}
	})
	return manager
}

// GetClient gets or creates a MongoDB client for the given asset
func (m *Manager) GetClient(assetID string) (*mongo.Client, error) {
	m.mu.RLock()
	client, exists := m.clients[assetID]
	m.mu.RUnlock()

	if exists && client != nil {
		return client, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double check after acquiring write lock
	if client, exists := m.clients[assetID]; exists && client != nil {
		return client, nil
	}

	// Load asset config
	dbConfig, err := asset.Get().GetDatabase(assetID)
	if err != nil {
		return nil, err
	}

	if dbConfig.Type != "mongo" {
		return nil, fmt.Errorf("asset %s is not a MongoDB database", assetID)
	}

	// Create MongoDB client options
	uri := dbConfig.URI
	if uri == "" {
		uri = dbutil.MongoURI(dbutil.DBConfig{Host: dbConfig.Host, Port: dbConfig.Port, User: dbConfig.User, Password: dbConfig.Password, Database: dbConfig.Database})
	}
	clientOpts := options.Client().ApplyURI(uri)

	// Set timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to MongoDB
	client, err = mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// Ping to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	m.clients[assetID] = client
	return client, nil
}

// withTimeout creates a context with 10-second timeout
func (m *Manager) withTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, 10*time.Second)
}

// ListDatabases returns list of database names and the default database
func (m *Manager) ListDatabases(ctx context.Context, assetID string) ([]string, string, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, "", err
	}

	// Get default database from asset config
	var defaultDB string
	if dbConfig, err := asset.Get().GetDatabase(assetID); err == nil {
		if dbConfig.Database != "" {
			defaultDB = dbConfig.Database
		} else if dbConfig.URI != "" {
			if uri, err := url.Parse(dbConfig.URI); err == nil {
				defaultDB = strings.TrimPrefix(uri.Path, "/")
			}
		}
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	result, err := client.ListDatabaseNames(ctx, bson.M{})
	if err != nil {
		return nil, "", err
	}

	// Sort databases
	sort.Strings(result)

	return result, defaultDB, nil
}

// ListCollections returns list of collection names in a database
func (m *Manager) ListCollections(ctx context.Context, assetID, database string) ([]string, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	db := client.Database(database)
	result, err := db.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return nil, err
	}

	// Sort collections
	sort.Strings(result)

	return result, nil
}

// QueryDocuments executes a query with filter, sort, skip, and limit
func (m *Manager) QueryDocuments(ctx context.Context, assetID, database, collection string, filter bson.M, sort bson.D, skip, limit int64) ([]bson.M, int64, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, 0, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	// Get total count
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	// Find documents
	findOpts := options.Find()
	if limit > 0 {
		findOpts.SetLimit(limit)
	}
	if skip > 0 {
		findOpts.SetSkip(skip)
	}
	if sort != nil && len(sort) > 0 {
		findOpts.SetSort(sort)
	}

	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var documents []bson.M
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, 0, err
	}

	return documents, total, nil
}

// AggregateDocuments executes an aggregation pipeline
func (m *Manager) AggregateDocuments(ctx context.Context, assetID, database, collection string, pipeline []bson.D, limit int64) ([]bson.M, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	// Add limit to pipeline if specified
	if limit > 0 {
		pipeline = append(pipeline, bson.D{{Key: "$limit", Value: limit}})
	}

	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var documents []bson.M
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, err
	}

	return documents, nil
}

// UpdateDocument updates a single document using $set
func (m *Manager) UpdateDocument(ctx context.Context, assetID, database, collection string, filter bson.M, update bson.M) error {
	client, err := m.GetClient(assetID)
	if err != nil {
		return err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	// Ensure we're using $set to avoid replacing entire document
	var updateDoc bson.M
	hasOperator, hasField := false, false
	for key := range update {
		if strings.HasPrefix(key, "$") {
			hasOperator = true
		} else {
			hasField = true
		}
	}
	if hasOperator && hasField {
		return fmt.Errorf("cannot mix update operators and plain fields")
	}
	if hasOperator {
		updateDoc = update
	} else {
		fields := bson.M{}
		for key, val := range update {
			if key != "_id" {
				fields[key] = val
			}
		}
		if len(fields) == 0 {
			return fmt.Errorf("no mutable fields in update")
		}
		updateDoc = bson.M{"$set": fields}
	}

	result, err := coll.UpdateOne(ctx, filter, updateDoc)
	if err == nil && result.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return err
}

// DeleteDocuments deletes documents matching the filter
func (m *Manager) DeleteDocuments(ctx context.Context, assetID, database, collection string, filter bson.M) (int64, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return 0, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	result, err := coll.DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}

	return result.DeletedCount, nil
}

// InsertDocument inserts a new document
func (m *Manager) InsertDocument(ctx context.Context, assetID, database, collection string, document bson.M) (interface{}, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	result, err := coll.InsertOne(ctx, document)
	if err != nil {
		return nil, err
	}

	return result.InsertedID, nil
}

// SampleSchema samples documents to extract field names for autocomplete
func (m *Manager) SampleSchema(ctx context.Context, assetID, database, collection string, sampleSize int) ([]string, error) {
	client, err := m.GetClient(assetID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := m.withTimeout(ctx)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	// Find sample documents
	findOpts := options.Find().SetLimit(int64(sampleSize))
	cursor, err := coll.Find(ctx, bson.M{}, findOpts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var documents []bson.M
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, err
	}

	// Extract unique field names
	fieldSet := make(map[string]struct{})
	for _, doc := range documents {
		for key := range doc {
			fieldSet[key] = struct{}{}
		}
	}

	// Convert to slice
	fields := make([]string, 0, len(fieldSet))
	for field := range fieldSet {
		fields = append(fields, field)
	}

	return fields, nil
}

// ConvertDocumentsToExtJSON converts BSON documents to Extended JSON format
func (m *Manager) ConvertDocumentsToExtJSON(docs []bson.M) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, len(docs))
	for i, doc := range docs {
		extJSON, err := mongoutil.BSONToExtJSON(doc)
		if err != nil {
			return nil, fmt.Errorf("failed to convert document %d: %w", i, err)
		}
		result[i] = extJSON
	}
	return result, nil
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for id, client := range m.clients {
		_ = client.Disconnect(ctx)
		delete(m.clients, id)
	}
}
