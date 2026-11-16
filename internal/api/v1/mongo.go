package v1

import (
	"encoding/json"
	"net/http"
	"opsnexus/internal/service/mongo"
	"opsnexus/pkg/mongoutil"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
)

// MongoDatabases lists all databases
func MongoDatabases(c *gin.Context) {
	assetID := c.Query("asset_id")
	if assetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id is required"})
		return
	}

	databases, defaultDB, err := mongo.GetManager().ListDatabases(c.Request.Context(), assetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"databases":        databases,
		"default_database": defaultDB,
	})
}

// MongoCollections lists all collections in a database
func MongoCollections(c *gin.Context) {
	assetID := c.Query("asset_id")
	database := c.Query("database")

	if assetID == "" || database == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id and database are required"})
		return
	}

	collections, err := mongo.GetManager().ListCollections(c.Request.Context(), assetID, database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"collections": collections})
}

type MongoQueryRequest struct {
	AssetID    string                 `json:"asset_id" binding:"required"`
	Database   string                 `json:"database" binding:"required"`
	Collection string                 `json:"collection" binding:"required"`
	Filter     map[string]interface{} `json:"filter"`
	Sort       json.RawMessage        `json:"sort"`
	Skip       int64                  `json:"skip" binding:"min=0"`
	Limit      int64                  `json:"limit" binding:"min=0,max=1000"`
}

// MongoQuery executes a query with filter, sort, skip, and limit
func MongoQuery(c *gin.Context) {
	var req MongoQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	filter := bson.M{}
	var err error
	if req.Filter != nil {
		filter, err = mongoutil.ExtJSONToBSON(req.Filter)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filter: " + err.Error()})
			return
		}
	}
	sort := bson.D{}
	if len(req.Sort) != 0 && string(req.Sort) != "null" {
		if err := bson.UnmarshalExtJSON(req.Sort, false, &sort); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sort: " + err.Error()})
			return
		}
	}
	// Set default limit if not specified
	if req.Limit == 0 {
		req.Limit = 50
	}

	documents, total, err := mongo.GetManager().QueryDocuments(
		c.Request.Context(),
		req.AssetID,
		req.Database,
		req.Collection,
		filter,
		sort,
		req.Skip,
		req.Limit,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Convert to Extended JSON
	extJSONDocs, err := mongo.GetManager().ConvertDocumentsToExtJSON(documents)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"documents": extJSONDocs,
		"total":     total,
		"hasMore":   req.Skip+req.Limit < total,
	})
}

type MongoAggregateRequest struct {
	AssetID    string          `json:"asset_id" binding:"required"`
	Database   string          `json:"database" binding:"required"`
	Collection string          `json:"collection" binding:"required"`
	Pipeline   json.RawMessage `json:"pipeline" binding:"required"`
	Limit      int64           `json:"limit" binding:"min=0,max=1000"`
}

// MongoAggregate executes an aggregation pipeline
func MongoAggregate(c *gin.Context) {
	var req MongoAggregateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var pipeline []bson.D
	if err := bson.UnmarshalExtJSON(req.Pipeline, false, &pipeline); err != nil || pipeline == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pipeline must be an array of documents"})
		return
	}
	if req.Limit == 0 {
		req.Limit = 1000
	}
	documents, err := mongo.GetManager().AggregateDocuments(
		c.Request.Context(),
		req.AssetID,
		req.Database,
		req.Collection,
		pipeline,
		req.Limit,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Convert to Extended JSON
	extJSONDocs, err := mongo.GetManager().ConvertDocumentsToExtJSON(documents)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"documents": extJSONDocs,
		"total":     len(extJSONDocs),
	})
}

type MongoUpdateDocRequest struct {
	AssetID    string                 `json:"asset_id" binding:"required"`
	Database   string                 `json:"database" binding:"required"`
	Collection string                 `json:"collection" binding:"required"`
	Filter     map[string]interface{} `json:"filter" binding:"required,min=1"`
	Update     map[string]interface{} `json:"update" binding:"required"`
}

// MongoUpdateDoc updates a document
func MongoUpdateDoc(c *gin.Context) {
	var req MongoUpdateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert filter and update to bson.M
	// Note: Frontend should send Extended JSON, we need to convert it to BSON
	filterJSON, _ := json.Marshal(req.Filter)
	filter, err := convertExtJSONToBSON(filterJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filter: " + err.Error()})
		return
	}

	updateJSON, _ := json.Marshal(req.Update)
	update, err := convertExtJSONToBSON(updateJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid update: " + err.Error()})
		return
	}

	err = mongo.GetManager().UpdateDocument(
		c.Request.Context(),
		req.AssetID,
		req.Database,
		req.Collection,
		filter,
		update,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type MongoDeleteDocRequest struct {
	AssetID    string                 `json:"asset_id" binding:"required"`
	Database   string                 `json:"database" binding:"required"`
	Collection string                 `json:"collection" binding:"required"`
	Filter     map[string]interface{} `json:"filter" binding:"required,min=1"`
}

// MongoDeleteDoc deletes documents
func MongoDeleteDoc(c *gin.Context) {
	var req MongoDeleteDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert filter to bson.M
	filterJSON, _ := json.Marshal(req.Filter)
	filter, err := convertExtJSONToBSON(filterJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filter: " + err.Error()})
		return
	}

	deletedCount, err := mongo.GetManager().DeleteDocuments(
		c.Request.Context(),
		req.AssetID,
		req.Database,
		req.Collection,
		filter,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":       "ok",
		"deletedCount": deletedCount,
	})
}

type MongoInsertDocRequest struct {
	AssetID    string                 `json:"asset_id" binding:"required"`
	Database   string                 `json:"database" binding:"required"`
	Collection string                 `json:"collection" binding:"required"`
	Document   map[string]interface{} `json:"document" binding:"required"`
}

// MongoInsertDoc inserts a new document
func MongoInsertDoc(c *gin.Context) {
	var req MongoInsertDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert document to bson.M
	docJSON, _ := json.Marshal(req.Document)
	document, err := convertExtJSONToBSON(docJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document: " + err.Error()})
		return
	}

	insertedID, err := mongo.GetManager().InsertDocument(
		c.Request.Context(),
		req.AssetID,
		req.Database,
		req.Collection,
		document,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"insertedId": insertedID,
	})
}

// MongoSchemaSample samples documents to get field names
func MongoSchemaSample(c *gin.Context) {
	assetID := c.Query("asset_id")
	database := c.Query("database")
	collection := c.Query("collection")

	if assetID == "" || database == "" || collection == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id, database, and collection are required"})
		return
	}

	sampleSize := 100
	if sizeStr := c.Query("sample_size"); sizeStr != "" {
		size, err := strconv.Atoi(sizeStr)
		if err != nil || size < 1 || size > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "sample_size must be between 1 and 1000"})
			return
		}
		sampleSize = size
	}

	fields, err := mongo.GetManager().SampleSchema(
		c.Request.Context(),
		assetID,
		database,
		collection,
		sampleSize,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"fields": fields})
}

// Helper function to convert Extended JSON to BSON
func convertExtJSONToBSON(data []byte) (bson.M, error) {
	return mongoutil.JSONToBSONDocument(data)
}

// MongoRunScript executes a raw MongoDB script
func MongoRunScript(c *gin.Context) {
	var req struct {
		AssetID  string `json:"asset_id" binding:"required"`
		Database string `json:"database" binding:"required"`
		Script   string `json:"script" binding:"required"`
		Mode     string `json:"mode" binding:"omitempty,oneof=native shell"` // "native" or "shell"
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default to native if not specified
	if req.Mode == "" {
		req.Mode = "native"
	}

	result, err := mongo.GetManager().ExecuteScript(c.Request.Context(), req.AssetID, req.Database, req.Script, req.Mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// MongoGetCapabilities returns the capabilities of the MongoDB module
func MongoGetCapabilities(c *gin.Context) {
	caps := mongo.GetProber().GetCapabilities()
	c.JSON(http.StatusOK, caps)
}
