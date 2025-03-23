package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	defaultPort = 44123
	dataDir     = "data"
	clientsFile = "clients.json"
	userFile    = "user.json"
)

// User 表示登录用户信息
type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Client 表示客户端信息
type Client struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Connected    bool      `json:"connected"`
	LastSeen     time.Time `json:"lastSeen"`
	CPU          float64   `json:"cpu"`
	Memory       float64   `json:"memory"`
	DiskUsage    float64   `json:"diskUsage"`
	DisplayOrder int       `json:"displayOrder"`
}

// ClientDB 管理所有已注册的客户端
type ClientDB struct {
	mu      sync.RWMutex
	clients map[string]*Client
	conns   map[string]*websocket.Conn
}

// UserDB 管理用户信息
type UserDB struct {
	mu   sync.RWMutex
	user User
}

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true // 允许所有跨域请求，生产环境应该更严格
		},
	}
	clientDB = &ClientDB{
		clients: make(map[string]*Client),
		conns:   make(map[string]*websocket.Conn),
	}
	userDB = &UserDB{
		user: User{
			Username: "admin",
			Password: "admin",
		},
	}
)

func main() {
	port := flag.Int("port", defaultPort, "服务端口号")
	flag.Parse()

	// 确保数据目录存在
	ensureDataDir()

	// 加载已保存的客户端信息
	loadClients()

	// 加载用户信息
	loadUser()

	// 监视客户端连接状态
	go monitorClientConnections()

	// 设置静态文件服务
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("assets"))))

	// API 路由
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/logout", handleLogout)
	http.HandleFunc("/api/change-password", handleChangePassword)
	http.HandleFunc("/api/clients", handleGetClients)
	http.HandleFunc("/api/clients/add", handleAddClient)
	http.HandleFunc("/api/clients/delete", handleDeleteClient)
	http.HandleFunc("/api/clients/reorder", handleReorderClients)

	// WebSocket 路由处理客户端连接
	http.HandleFunc("/ws", handleClientConnection)

	// 网页路由
	http.HandleFunc("/", handleIndex)

	// 启动服务器
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("服务器启动在 http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

// ensureDataDir 确保数据目录存在
func ensureDataDir() {
	dataPath := filepath.Join(dataDir)
	if err := os.MkdirAll(dataPath, 0755); err != nil {
		log.Fatalf("无法创建数据目录: %v", err)
	}
}

// loadClients 从文件加载客户端信息
func loadClients() {
	filePath := filepath.Join(dataDir, clientsFile)
	data, err := os.ReadFile(filePath)
	if os.IsNotExist(err) {
		log.Println("客户端文件不存在，创建新文件")
		saveClients()
		return
	}
	if err != nil {
		log.Printf("加载客户端文件出错: %v", err)
		return
	}

	var clients map[string]*Client
	if err := json.Unmarshal(data, &clients); err != nil {
		log.Printf("解析客户端数据出错: %v", err)
		return
	}

	clientDB.mu.Lock()
	clientDB.clients = clients

	// 修复客户端ID字段
	var needSave bool
	for id, client := range clientDB.clients {
		client.Connected = false
		// 如果ID字段为空，则用map的key填充
		if client.ID == "" {
			client.ID = id
			needSave = true
			log.Printf("修复客户端ID: %s", id)
		}
		clientDB.clients[id] = client
	}
	clientDB.mu.Unlock()

	// 如果有修复，保存更新后的数据
	if needSave {
		log.Println("检测到空ID字段，保存修复后的客户端数据")
		saveClients()
	}

	log.Printf("已加载 %d 个客户端", len(clients))
}

// saveClients 保存客户端信息到文件
func saveClients() {
	clientDB.mu.RLock()
	clients := clientDB.clients
	clientDB.mu.RUnlock()

	data, err := json.MarshalIndent(clients, "", "  ")
	if err != nil {
		log.Printf("序列化客户端数据出错: %v", err)
		return
	}

	filePath := filepath.Join(dataDir, clientsFile)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("保存客户端数据出错: %v", err)
		return
	}
}

// loadUser 从文件加载用户信息
func loadUser() {
	filePath := filepath.Join(dataDir, userFile)
	data, err := os.ReadFile(filePath)
	if os.IsNotExist(err) {
		log.Println("用户文件不存在，创建默认用户")
		saveUser()
		return
	}
	if err != nil {
		log.Printf("加载用户文件出错: %v", err)
		return
	}

	var user User
	if err := json.Unmarshal(data, &user); err != nil {
		log.Printf("解析用户数据出错: %v", err)
		return
	}

	userDB.mu.Lock()
	userDB.user = user
	userDB.mu.Unlock()
	log.Printf("已加载用户: %s", user.Username)
}

// saveUser 保存用户信息到文件
func saveUser() {
	userDB.mu.RLock()
	user := userDB.user
	userDB.mu.RUnlock()

	data, err := json.MarshalIndent(user, "", "  ")
	if err != nil {
		log.Printf("序列化用户数据出错: %v", err)
		return
	}

	filePath := filepath.Join(dataDir, userFile)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("保存用户数据出错: %v", err)
		return
	}
}

// monitorClientConnections 监控客户端连接状态
func monitorClientConnections() {
	for {
		time.Sleep(10 * time.Second)
		now := time.Now()
		clientDB.mu.Lock()
		for id, client := range clientDB.clients {
			// 如果客户端超过30秒没有更新，标记为断开
			if client.Connected && now.Sub(client.LastSeen) > 30*time.Second {
				client.Connected = false
				clientDB.clients[id] = client
				log.Printf("客户端 %s 已断开连接", id)
			}
		}
		clientDB.mu.Unlock()
		saveClients()
	}
}

// handleIndex 处理主页请求
func handleIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "templates/index.html")
}

// handleLogin 处理登录请求
func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userDB.mu.RLock()
	user := userDB.user
	userDB.mu.RUnlock()

	if credentials.Username != user.Username || credentials.Password != user.Password {
		log.Printf("登录失败: 用户名或密码错误 (尝试: %s)", credentials.Username)
		http.Error(w, "用户名或密码不正确", http.StatusUnauthorized)
		return
	}

	// 在实际应用中应使用更安全的会话管理方式
	session := fmt.Sprintf("session_%d", time.Now().UnixNano())
	cookie := &http.Cookie{
		Name:     "session",
		Value:    session,
		Path:     "/",
		HttpOnly: false,
		MaxAge:   3600 * 24 * 7, // 7天
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)

	log.Printf("用户 %s 登录成功，设置会话: %s，过期时间：%d秒", credentials.Username, session, cookie.MaxAge)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleLogout 处理登出请求
func handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleChangePassword 处理修改密码请求
func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 检查是否已登录
	_, err := r.Cookie("session")
	if err != nil {
		http.Error(w, "未授权", http.StatusUnauthorized)
		return
	}

	var credentials struct {
		Username    string `json:"username"`
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userDB.mu.Lock()
	defer userDB.mu.Unlock()

	if credentials.OldPassword != userDB.user.Password {
		http.Error(w, "原密码不正确", http.StatusUnauthorized)
		return
	}

	userDB.user.Username = credentials.Username
	userDB.user.Password = credentials.NewPassword
	saveUser()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleGetClients 获取所有客户端信息
func handleGetClients(w http.ResponseWriter, r *http.Request) {
	clientDB.mu.RLock()
	// 转换为切片并按DisplayOrder排序
	clientList := make([]*Client, 0, len(clientDB.clients))
	for _, client := range clientDB.clients {
		clientList = append(clientList, client)
	}
	clientDB.mu.RUnlock()

	// 检查是否登录，决定是否包含ID
	var isLoggedIn bool
	cookie, err := r.Cookie("session")

	// 只有当Cookie存在、不为空时才认为用户已登录
	isLoggedIn = (err == nil && cookie != nil && cookie.Value != "")

	log.Printf("GetClients请求 - 最终登录状态: %v", isLoggedIn)

	// 如果未登录，不返回客户端ID
	if !isLoggedIn {
		for _, client := range clientList {
			client.ID = ""
		}
		log.Println("用户未登录，隐藏所有客户端ID")
	} else {
		log.Println("用户已登录，显示所有客户端ID")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clientList)
}

// handleAddClient 添加新客户端
func handleAddClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 检查是否已登录
	_, err := r.Cookie("session")
	if err != nil {
		http.Error(w, "未授权", http.StatusUnauthorized)
		return
	}

	var clientInfo struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&clientInfo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 生成唯一ID
	id := fmt.Sprintf("client_%d", time.Now().UnixNano())

	clientDB.mu.Lock()
	// 确定最大的显示顺序
	maxOrder := 0
	for _, c := range clientDB.clients {
		if c.DisplayOrder > maxOrder {
			maxOrder = c.DisplayOrder
		}
	}

	// 确保ID字段正确设置
	newClient := &Client{
		ID:           id, // 这里确保ID字段设置正确
		Name:         clientInfo.Name,
		Connected:    false,
		LastSeen:     time.Time{},
		CPU:          0,
		Memory:       0,
		DiskUsage:    0,
		DisplayOrder: maxOrder + 1,
	}
	clientDB.clients[id] = newClient
	clientDB.mu.Unlock()

	saveClients()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"id":     id,
	})
}

// handleDeleteClient 删除客户端
func handleDeleteClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 检查是否已登录
	_, err := r.Cookie("session")
	if err != nil {
		http.Error(w, "未授权", http.StatusUnauthorized)
		return
	}

	var clientInfo struct {
		ID string `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&clientInfo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	clientDB.mu.Lock()
	delete(clientDB.clients, clientInfo.ID)
	if conn, ok := clientDB.conns[clientInfo.ID]; ok {
		conn.Close()
		delete(clientDB.conns, clientInfo.ID)
	}
	clientDB.mu.Unlock()

	saveClients()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleReorderClients 重新排序客户端
func handleReorderClients(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 检查是否已登录
	_, err := r.Cookie("session")
	if err != nil {
		http.Error(w, "未授权", http.StatusUnauthorized)
		return
	}

	var orderInfo struct {
		Orders map[string]int `json:"orders"`
	}

	if err := json.NewDecoder(r.Body).Decode(&orderInfo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	clientDB.mu.Lock()
	for id, order := range orderInfo.Orders {
		if client, ok := clientDB.clients[id]; ok {
			client.DisplayOrder = order
		}
	}
	clientDB.mu.Unlock()

	saveClients()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleClientConnection 处理客户端WebSocket连接
func handleClientConnection(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("id")
	if clientID == "" {
		http.Error(w, "缺少客户端ID", http.StatusBadRequest)
		return
	}

	// 检查客户端ID是否存在
	clientDB.mu.RLock()
	_, exists := clientDB.clients[clientID]
	clientDB.mu.RUnlock()

	if !exists {
		http.Error(w, "未注册的客户端ID", http.StatusBadRequest)
		return
	}

	// 升级HTTP连接为WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级WebSocket连接失败: %v", err)
		return
	}

	// 更新客户端连接信息
	clientDB.mu.Lock()
	if oldConn, ok := clientDB.conns[clientID]; ok {
		oldConn.Close()
	}
	clientDB.conns[clientID] = conn
	client := clientDB.clients[clientID]
	// 确保ID字段正确
	if client.ID == "" {
		client.ID = clientID
		log.Printf("修复客户端ID: %s", clientID)
	}
	client.Connected = true
	client.LastSeen = time.Now()
	clientDB.clients[clientID] = client
	clientDB.mu.Unlock()

	log.Printf("客户端 %s 已连接", clientID)

	// 启动一个goroutine处理WebSocket消息
	go handleClientMessages(conn, clientID)
}

// handleClientMessages 处理来自客户端的WebSocket消息
func handleClientMessages(conn *websocket.Conn, clientID string) {
	defer func() {
		conn.Close()
		clientDB.mu.Lock()
		delete(clientDB.conns, clientID)
		if client, ok := clientDB.clients[clientID]; ok {
			client.Connected = false
			clientDB.clients[clientID] = client
		}
		clientDB.mu.Unlock()
		log.Printf("客户端 %s 连接已关闭", clientID)
	}()

	for {
		var metrics struct {
			CPU       float64 `json:"cpu"`
			Memory    float64 `json:"memory"`
			DiskUsage float64 `json:"diskUsage"`
		}

		if err := conn.ReadJSON(&metrics); err != nil {
			log.Printf("从客户端 %s 读取数据失败: %v", clientID, err)
			break
		}

		clientDB.mu.Lock()
		if client, ok := clientDB.clients[clientID]; ok {
			// 确保ID字段正确
			if client.ID == "" {
				client.ID = clientID
			}
			client.CPU = metrics.CPU
			client.Memory = metrics.Memory
			client.DiskUsage = metrics.DiskUsage
			client.LastSeen = time.Now()
			client.Connected = true
			clientDB.clients[clientID] = client
		}
		clientDB.mu.Unlock()
	}
}
