# 服务器监控系统

一个使用Go语言开发的服务器监控系统，包含服务端和客户端组件。

## 功能特点

### 服务端

1. Web界面展示所有客户端的CPU、内存和磁盘使用情况
2. 实时监控客户端连接状态，使用绿色/红色指示器显示
3. 登录系统，控制客户端的添加和删除权限
4. 支持修改管理员账号和密码
5. 客户端数据使用平滑动画进度条展示，根据占用率显示不同颜色
6. 支持对客户端卡片排序
7. 响应式设计，适配移动设备

### 客户端

1. 命令行工具，使用服务端提供的ID连接服务端
2. 实时监控本机的CPU、内存和磁盘使用率
3. 每秒向服务端发送一次监控数据

## 编译与运行

### 编译

```bash
# 编译服务端
go build -o server.exe ./server

# 编译客户端
go build -o client.exe ./client
```

### 运行服务端

```bash
# 使用默认端口 (44123)
./server.exe

# 指定端口
./server.exe -port=8080
```

### 运行客户端

```bash
# 默认连接到本地服务端
./client.exe -id=YOUR_CLIENT_ID

# 连接到指定服务端
./client.exe -server=192.168.1.100:44123 -id=YOUR_CLIENT_ID
```

## 默认账号

- 用户名: admin
- 密码: admin

## 技术栈

- 后端: Go (gorilla/websocket)
- 前端: Vue 3 + Bootstrap 5
- 监控: shirou/gopsutil

## 数据持久化

服务端使用JSON文件保存用户和客户端数据：

- `server/data/user.json`: 用户信息
- `server/data/clients.json`: 客户端信息 