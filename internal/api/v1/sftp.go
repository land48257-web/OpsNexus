package v1

import (
	"context"
	"io"
	"mime"
	"net/http"
	"opsnexus/internal/service/ssh_service"
	"os"
	"path"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListFiles lists files in a directory via SFTP
func ListFiles(c *gin.Context) {
	assetID := c.Param("asset_id")
	path := c.DefaultQuery("path", "/")

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found. Please connect via terminal first."})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client: " + err.Error()})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// List directory
	files, err := sftpClient.ReadDir(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read directory: " + err.Error()})
		return
	}

	// Convert to response format
	type FileInfo struct {
		Name  string `json:"name"`
		Size  int64  `json:"size"`
		IsDir bool   `json:"is_dir"`
		Mode  string `json:"mode"`
	}

	result := make([]FileInfo, len(files))
	for i, f := range files {
		result[i] = FileInfo{
			Name:  f.Name(),
			Size:  f.Size(),
			IsDir: f.IsDir(),
			Mode:  f.Mode().String(),
		}
	}

	c.JSON(http.StatusOK, gin.H{"path": path, "files": result})
}

// UploadFile handles file upload via SFTP
func UploadFile(c *gin.Context) {
	assetID := c.Param("asset_id")
	remotePath := c.DefaultQuery("path", "/tmp")

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found"})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client"})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// Get uploaded file
	file, header, err := c.Request.FormFile("file")
	defer func() {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
	}()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Create remote file
	fullPath := path.Join(remotePath, path.Base(header.Filename))
	remoteFile, err := sftpClient.Create(fullPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create remote file: " + err.Error()})
		return
	}
	defer remoteFile.Close()

	// Copy data
	written, err := io.Copy(remoteFile, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Upload failed: " + err.Error()})
		return
	}

	if err := remoteFile.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Upload close failed: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "File uploaded successfully",
		"path":    fullPath,
		"size":    written,
	})
}

// DownloadFile handles file download via SFTP
func DownloadFile(c *gin.Context) {
	assetID := c.Param("asset_id")
	remotePath := c.Query("path")

	if remotePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found"})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client"})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// Open remote file
	remoteFile, err := sftpClient.Open(remotePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found: " + err.Error()})
		return
	}
	defer remoteFile.Close()

	// Get file info for size
	stat, err := remoteFile.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get file info"})
		return
	}

	// Set headers
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": path.Base(remotePath)}))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(stat.Size(), 10))

	// Stream file
	io.Copy(c.Writer, remoteFile)
}

// CreateDirectory creates a new directory via SFTP
func CreateDirectory(c *gin.Context) {
	assetID := c.Param("asset_id")
	dirPath := c.Query("path")

	if dirPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found"})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client"})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// Create directory
	err = sftpClient.Mkdir(dirPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create directory: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Directory created successfully", "path": dirPath})
}

// CreateFile creates a new empty file via SFTP
func CreateFile(c *gin.Context) {
	assetID := c.Param("asset_id")
	filePath := c.Query("path")

	if filePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found"})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client"})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// Create file
	f, err := sftpClient.OpenFile(filePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file: " + err.Error()})
		return
	}
	if err := f.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to close file: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File created successfully", "path": filePath})
}

// DeletePath removes a file or directory via SFTP
func DeletePath(c *gin.Context) {
	assetID := c.Param("asset_id")
	remotePath := c.Query("path")

	if remotePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	// Get existing SSH connection
	sshConn, err := ssh_service.GetManager().Get(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSH connection not found"})
		return
	}

	// Create SFTP client
	sftpClient, err := sshConn.NewSFTPClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SFTP client"})
		return
	}
	defer sftpClient.Close()
	stop := context.AfterFunc(c.Request.Context(), func() { _ = sftpClient.Close() })
	defer stop()

	// Try to remove file first
	err = sftpClient.Remove(remotePath)
	if err != nil {
		// If failed, try to remove directory
		err = sftpClient.RemoveDirectory(remotePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deleted successfully", "path": remotePath})
}
