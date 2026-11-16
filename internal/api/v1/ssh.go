package v1

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"opsnexus/internal/service/asset"
	"opsnexus/internal/service/ssh_service"
	"opsnexus/pkg/sshutil"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// The frontend dev proxy preserves Host, allowing the default same-origin check.
var upgrader = websocket.Upgrader{}

// Gorilla permits one concurrent writer. SSH stdout and stderr share this writer.
// Binary frames preserve UTF-8 sequences split across arbitrary SSH reads.
type terminalWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *terminalWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	_ = w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := w.conn.WriteMessage(websocket.BinaryMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func SSHWebSocket(c *gin.Context) {
	assetID := c.Query("asset_id")
	if assetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id is required"})
		return
	}
	serverConfig, err := asset.Get().GetServer(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Server not found"})
		return
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(1024 * 1024)
	if expires, ok := c.Get("expires_at"); ok {
		timer := time.AfterFunc(time.Until(expires.(time.Time)), func() { _ = conn.Close() })
		defer timer.Stop()
	}
	writer := &terminalWriter{conn: conn}
	message := func(text string) { _, _ = io.WriteString(writer, "\r\n[System] "+text+"\r\n") }
	sshConn, err := ssh_service.GetManager().GetOrCreate(assetID, &sshutil.Config{
		Host: serverConfig.Host, Port: serverConfig.Port, User: serverConfig.User,
		Password: serverConfig.Password, KeyPath: serverConfig.PrivateKeyPath, Timeout: 10 * time.Second,
	})
	if err != nil {
		message("SSH Connection Failed: " + err.Error())
		return
	}
	session, err := sshConn.NewShellSession()
	if err != nil {
		// A broken transport may be observed before the monitor evicts it.
		var rejected *ssh.OpenChannelError
		if !errors.As(err, &rejected) {
			ssh_service.GetManager().Remove(assetID, sshConn)
		}
		message("Session Creation Failed: " + err.Error())
		return
	}
	defer session.Close()
	if err := session.RequestPty("xterm-256color", 40, 80, sshutil.CreateTerminalModes()); err != nil {
		message("PTY Request Failed: " + err.Error())
		return
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		message("Stdin failed: " + err.Error())
		return
	}
	// Let ssh.Session manage output goroutines and wait for both streams.
	session.Stdout, session.Stderr = writer, writer
	if err := session.Shell(); err != nil {
		message("Shell Start Failed: " + err.Error())
		return
	}
	message("Connected to " + serverConfig.Name)
	// A distinct control message avoids relying on chunk boundaries or shell text.
	writer.mu.Lock()
	_ = conn.WriteJSON(gin.H{"type": "connected"})
	writer.mu.Unlock()
	go func() { _ = session.Wait(); _ = conn.Close() }()
	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType == websocket.TextMessage {
			var resize struct {
				Cols int `json:"cols"`
				Rows int `json:"rows"`
			}
			if json.Unmarshal(p, &resize) == nil && resize.Cols > 0 && resize.Rows > 0 && resize.Cols <= 1000 && resize.Rows <= 1000 {
				if err := session.WindowChange(resize.Rows, resize.Cols); err != nil {
					return
				}
				continue
			}
		}
		if _, err := stdin.Write(p); err != nil {
			return
		}
	}
}
