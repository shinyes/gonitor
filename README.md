# Go Monitor

一个现代化的服务器监控系统，使用Go语言开发，提供直观的Web界面来监控多个服务器的系统资源。

## 功能特点

- 💻 实时监控系统资源
  - CPU 使用率
  - 内存使用情况
  - 硬盘使用状态
  - 网络传输速度

- 🎨 美观的用户界面
  - 响应式设计，支持各种设备
  - 深色/浅色主题切换
  - 实时数据更新
  - 流畅的动画效果

- 🛠 便捷的管理功能
  - 服务器拖拽排序
  - 客户端ID一键复制
  - 客户端重命名
  - 服务器状态实时显示

- 🔒 安全可靠
  - 安全的客户端认证机制
  - 稳定的WebSocket连接
  - 自动重连机制

## 快速开始

### 服务端

1. 下载并安装服务端：

```bash
git clone https://github.com/yourusername/go-monitor.git
cd go-monitor/server
go build
```

2. 运行服务端：

```bash
./server -port=44123
```

### 客户端

1. 下载并编译客户端：

```bash
cd go-monitor/client
go build
```

2. 运行客户端：

```bash
./client -server=localhost:44123 -id=YOUR_CLIENT_ID
```

## 配置说明

### 服务端配置

- `-port`: 服务器监听端口（默认：44123）
- `-host`: 服务器监听地址（默认：0.0.0.0）

### 客户端配置

- `-server`: 服务器地址和端口
- `-id`: 客户端唯一标识
- `-interval`: 数据上报间隔（默认：1秒）

## 系统要求

- Go 1.16 或更高版本
- 支持现代浏览器（Chrome、Firefox、Safari、Edge）
- 系统：Windows、Linux、macOS

## 开发说明

### 目录结构

```
gonitor/
├── server/         # 服务端代码
│   ├── assets/     # 静态资源
│   └── templates/  # HTML模板
├── client/         # 客户端代码
└── common/         # 公共代码
```

### 技术栈

- 后端：Go
- 前端：HTML5、CSS3、JavaScript
- UI框架：Bootstrap 5
- 图标：Bootstrap Icons
- WebSocket：用于实时数据传输

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。 