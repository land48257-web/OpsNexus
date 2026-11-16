package ssh_service

import (
	"fmt"
	"opsnexus/pkg/sshutil"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

type ConnectionManager struct {
	connections map[string]*sshutil.SSHConnection
	mu          sync.RWMutex
	pending     singleflight.Group
	closed      bool
}

var manager = &ConnectionManager{connections: make(map[string]*sshutil.SSHConnection)}

func GetManager() *ConnectionManager { return manager }

func (m *ConnectionManager) GetOrCreate(assetID string, config *sshutil.Config) (*sshutil.SSHConnection, error) {
	value, err, _ := m.pending.Do(assetID, func() (interface{}, error) {
		if conn, err := m.Get(assetID); err == nil {
			return conn, nil
		}
		conn, err := sshutil.NewSSHConnection(config)
		if err != nil {
			return nil, err
		}
		m.mu.Lock()
		if m.closed {
			m.mu.Unlock()
			_ = conn.Close()
			return nil, fmt.Errorf("SSH manager is shutting down")
		}
		m.connections[assetID] = conn
		m.mu.Unlock()
		go m.monitor(assetID, conn)
		return conn, nil
	})
	if err != nil {
		return nil, err
	}
	return value.(*sshutil.SSHConnection), nil
}

// Evict failed connections so a new terminal can reconnect after a server reboot.
func (m *ConnectionManager) monitor(id string, conn *sshutil.SSHConnection) {
	done := make(chan struct{})
	go func() { _ = conn.Client.Wait(); close(done) }()
	defer func() {
		_ = conn.Close()
		m.mu.Lock()
		if m.connections[id] == conn {
			delete(m.connections, id)
		}
		m.mu.Unlock()
	}()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			result := make(chan error, 1)
			go func() { _, _, err := conn.Client.SendRequest("keepalive@openssh.com", true, nil); result <- err }()
			timer := time.NewTimer(10 * time.Second)
			select {
			case <-done:
				timer.Stop()
				return
			case err := <-result:
				timer.Stop()
				if err != nil {
					return
				}
			case <-timer.C:
				return
			}
		}
	}
}

func (m *ConnectionManager) Get(assetID string) (*sshutil.SSHConnection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if conn := m.connections[assetID]; conn != nil && !m.closed {
		return conn, nil
	}
	return nil, fmt.Errorf("connection not found for asset: %s", assetID)
}

func (m *ConnectionManager) Remove(assetID string, expected *sshutil.SSHConnection) {
	m.mu.Lock()
	if m.connections[assetID] == expected {
		delete(m.connections, assetID)
	}
	m.mu.Unlock()
	if expected != nil {
		_ = expected.Close()
	}
}

func (m *ConnectionManager) CloseAll() {
	m.mu.Lock()
	m.closed = true
	connections := m.connections
	m.connections = make(map[string]*sshutil.SSHConnection)
	m.mu.Unlock()
	for _, conn := range connections {
		_ = conn.Close()
	}
}
