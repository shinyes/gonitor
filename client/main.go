package main

import (
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"runtime"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

var (
	serverAddr = flag.String("server", "localhost:44123", "服务器地址")
	clientID   = flag.String("id", "", "客户端ID")
)

// 系统指标结构
type Metrics struct {
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"memory"`
	DiskUsage float64 `json:"diskUsage"`
}

func main() {
	flag.Parse()

	if *clientID == "" {
		log.Fatal("请提供客户端ID")
	}

	log.Printf("客户端启动，连接到服务器：%s，客户端ID：%s", *serverAddr, *clientID)

	// 构造WebSocket URL
	wsScheme := "ws"
	serverURL := *serverAddr

	// 检查服务器地址是否包含协议前缀
	if len(serverURL) >= 8 && serverURL[:8] == "https://" {
		wsScheme = "wss"
		serverURL = serverURL[8:]
	} else if len(serverURL) >= 7 && serverURL[:7] == "http://" {
		serverURL = serverURL[7:]
	}

	// 删除末尾的斜杠
	if len(serverURL) > 0 && serverURL[len(serverURL)-1] == '/' {
		serverURL = serverURL[:len(serverURL)-1]
	}

	u := url.URL{Scheme: wsScheme, Host: serverURL, Path: "/ws", RawQuery: fmt.Sprintf("id=%s", *clientID)}
	log.Printf("连接到 %s", u.String())

	// 连接到服务器
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatalf("连接到服务器失败: %v", err)
	}
	defer conn.Close()

	log.Println("成功连接到服务器")

	// 定时发送系统指标
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		metrics, err := collectMetrics()
		if err != nil {
			log.Printf("收集系统指标失败: %v", err)
			continue
		}

		if err := conn.WriteJSON(metrics); err != nil {
			log.Printf("发送数据失败: %v", err)
			// 尝试重新连接
			reconnect(u.String())
			break
		}
	}
}

// 收集系统指标
func collectMetrics() (Metrics, error) {
	metrics := Metrics{}

	// 获取CPU使用率
	cpuPercent, err := cpu.Percent(0, false)
	if err != nil {
		return metrics, fmt.Errorf("获取CPU使用率失败: %v", err)
	}
	if len(cpuPercent) > 0 {
		metrics.CPU = cpuPercent[0]
	}

	// 获取内存使用率
	memInfo, err := mem.VirtualMemory()
	if err != nil {
		return metrics, fmt.Errorf("获取内存信息失败: %v", err)
	}
	metrics.Memory = memInfo.UsedPercent

	// 获取所有磁盘的平均使用率
	var totalUsage float64
	var diskCount int

	partitions, err := disk.Partitions(false)
	if err != nil {
		return metrics, fmt.Errorf("获取磁盘分区信息失败: %v", err)
	}

	for _, partition := range partitions {
		// 跟据操作系统，跳过一些特殊的挂载点
		if runtime.GOOS == "windows" && partition.Fstype == "NTFS" ||
			runtime.GOOS != "windows" && (partition.Fstype == "ext4" || partition.Fstype == "xfs") {
			usage, err := disk.Usage(partition.Mountpoint)
			if err != nil {
				log.Printf("获取磁盘 %s 使用情况失败: %v", partition.Mountpoint, err)
				continue
			}
			totalUsage += usage.UsedPercent
			diskCount++
		}
	}

	if diskCount > 0 {
		metrics.DiskUsage = totalUsage / float64(diskCount)
	}

	return metrics, nil
}

// 尝试重新连接
func reconnect(serverUrl string) {
	for {
		log.Println("尝试重新连接服务器...")

		// 如果URL已经是正确的WebSocket格式(以ws://或wss://开头)，直接使用
		if len(serverUrl) >= 5 && (serverUrl[:5] == "ws://" || serverUrl[:6] == "wss://") {
			conn, _, err := websocket.DefaultDialer.Dial(serverUrl, nil)
			if err != nil {
				log.Printf("重新连接失败: %v，5秒后重试", err)
				time.Sleep(5 * time.Second)
				continue
			}
			log.Println("成功重新连接到服务器")
			conn.Close() // 关闭连接，让main函数重新启动连接循环
			os.Exit(0)   // 退出当前进程，由系统或守护进程重启
		}

		// 否则，应该是新的连接尝试，重启应用程序以重用主函数中的URL处理逻辑
		log.Println("URL格式需要重新处理，重启应用程序...")
		os.Exit(1) // 使用非零退出码以便监控系统知道这是一个错误
	}
}
