package v1

import (
	"errors"
	redisdriver "github.com/redis/go-redis/v9"
	"net/http"
	"opsnexus/internal/service/redis"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type ScanRequest struct {
	AssetID string `json:"asset_id" binding:"required"`
	Pattern string `json:"pattern"`
	Cursor  uint64 `json:"cursor"`
	Count   int64  `json:"count" binding:"min=0,max=1000"`
	DB      *int   `json:"db" binding:"omitempty,min=0,max=1024"` // Optional DB index
}

func RedisScan(c *gin.Context) {
	var req ScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Count == 0 {
		req.Count = 100 // Default count
	}
	if req.Pattern == "" {
		req.Pattern = "*"
	}

	dbIndex := -1
	if req.DB != nil {
		dbIndex = *req.DB
	}

	keys, nextCursor, err := redis.GetManager().ScanKeys(c.Request.Context(), req.AssetID, dbIndex, req.Pattern, req.Cursor, req.Count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"keys":   keys,
		"cursor": nextCursor,
	})
}

func RedisGetKey(c *gin.Context) {
	assetID := c.Query("asset_id")
	key := c.Query("key")
	dbStr := c.Query("db")

	if assetID == "" || key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id and key are required"})
		return
	}

	dbIndex := -1
	if dbStr != "" {
		// Parse db index
		// Ignoring error for simplicity, defaulting to -1 (default DB) if invalid?
		// Better to error if invalid.
		// For now, let's assume valid int or ignore.
		// Actually, let's parse it properly.
		var err error
		dbIndex, err = strconv.Atoi(dbStr)
		if err != nil || dbIndex < 0 || dbIndex > 1024 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid db index"})
			return
		}
	}

	detail, err := redis.GetManager().GetKeyDetail(c.Request.Context(), assetID, dbIndex, key)
	if errors.Is(err, redisdriver.Nil) {
		c.JSON(http.StatusNotFound, gin.H{"error": "key not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, detail)
}

type UpdateKeyRequest struct {
	AssetID string      `json:"asset_id" binding:"required"`
	Key     string      `json:"key" binding:"required"`
	Type    string      `json:"type" binding:"required"`
	Value   interface{} `json:"value" binding:"required"`
	TTL     int64       `json:"ttl" binding:"min=-1,max=9223372036"` // Seconds. -1 for persist.
	DB      *int        `json:"db" binding:"omitempty,min=0,max=1024"`
}

func RedisUpdateKey(c *gin.Context) {
	var req UpdateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var ttl time.Duration
	if req.TTL == -1 {
		ttl = -1 // Persist
	} else {
		ttl = time.Duration(req.TTL) * time.Second
	}

	dbIndex := -1
	if req.DB != nil {
		dbIndex = *req.DB
	}

	err := redis.GetManager().UpdateKey(c.Request.Context(), req.AssetID, dbIndex, req.Key, req.Type, req.Value, ttl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type DeleteKeyRequest struct {
	AssetID string   `json:"asset_id" binding:"required"`
	Keys    []string `json:"keys" binding:"required,min=1"`
	DB      *int     `json:"db" binding:"omitempty,min=0,max=1024"`
}

func RedisDeleteKey(c *gin.Context) {
	var req DeleteKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dbIndex := -1
	if req.DB != nil {
		dbIndex = *req.DB
	}

	err := redis.GetManager().DeleteKeys(c.Request.Context(), req.AssetID, dbIndex, req.Keys)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type CommandRequest struct {
	AssetID string        `json:"asset_id" binding:"required"`
	Command string        `json:"command" binding:"required"`
	Args    []interface{} `json:"args"`
	DB      *int          `json:"db" binding:"omitempty,min=0,max=1024"`
}

func RedisCommand(c *gin.Context) {
	var req CommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dbIndex := -1
	if req.DB != nil {
		dbIndex = *req.DB
	}

	result, err := redis.GetManager().ExecuteCommand(c.Request.Context(), req.AssetID, dbIndex, req.Command, req.Args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}
