# Go-Monitor 系统监控工具

一个基于Go语言开发的轻量级系统监控工具，由服务端和客户端组成，可以实时监控多台机器的CPU、内存和磁盘使用情况。

## 功能特点

- 服务端-客户端架构，支持多客户端同时连接
- 实时监控客户端的CPU、内存和磁盘使用率
- 基于WebSocket的实时数据传输
- 简洁的Web界面展示监控数据
- 客户端断开自动重连机制
- 支持客户端管理（添加、删除、排序）
- 用户认证系统，保护监控数据安全

## 系统要求

- Go 1.16+
- 支持Windows、Linux和macOS平台

## 安装方法

1. 克隆仓库：

```bash
git clone https://github.com/yourusername/go-monitor.git
cd go-monitor
```

2. 编译服务端：

```bash
cd server
go build
```

3. 编译客户端：

```bash
cd ../client
go build
```

## 使用方法

### 启动服务端

```bash
# 默认端口44123
./server

# 指定端口
./server -port=8080
```

服务端启动后，可通过浏览器访问 `http://localhost:44123` 进入监控界面。

### 启动客户端

```bash
# 连接到本地服务端
./client -id=client001

# 连接到远程服务端
./client -id=client001 -server=remote-server:44123
```

每个客户端需要一个唯一的ID，可以通过服务端Web界面添加客户端。

## 项目结构

```
go-monitor/
├── server/          # 服务端代码
│   ├── main.go      # 服务端主程序
│   ├── go.mod       # 依赖管理
│   ├── templates/   # Web模板
│   ├── assets/      # Web静态资源
│   └── data/        # 数据存储目录
├── client/          # 客户端代码
│   ├── main.go      # 客户端主程序
│   └── go.mod       # 依赖管理
└── assets/          # 项目资源文件
```

## 默认登录信息

- 用户名：admin
- 密码：admin

首次登录后，建议立即修改默认密码。

## 许可证

MIT 