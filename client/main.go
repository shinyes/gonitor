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
	"github.com/shirou/gopsutil/v3/net"
)

var (
	serverAddr = flag.String("server", "localhost:44123", "服务器地址")
	clientID   = flag.String("id", "", "客户端ID")
	// 记录上一次网络统计信息
	lastNetStats map[string]net.IOCountersStat
	lastNetTime  time.Time
	// 用于平滑处理的网速历史数据
	uploadSpeedHistory   []float64
	downloadSpeedHistory []float64
	// 网速历史数据窗口大小
	speedHistorySize = 3
)

// 系统指标结构
type Metrics struct {
	CPU           float64 `json:"cpu"`
	Memory        float64 `json:"memory"`
	DiskUsage     float64 `json:"diskUsage"`
	UploadSpeed   float64 `json:"uploadSpeed"`   // 上传网速 (KB/s)
	DownloadSpeed float64 `json:"downloadSpeed"` // 下载网速 (KB/s)
}

func main() {
	flag.Parse()

	if *clientID == "" {
		log.Fatal("请提供客户端ID")
	}

	// 初始化网络统计数据
	initNetStats()
	// 初始化网速历史数据
	uploadSpeedHistory = make([]float64, 0, speedHistorySize)
	downloadSpeedHistory = make([]float64, 0, speedHistorySize)

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

	// 启动单独的goroutine来收集网速数据，更频繁地采样
	go collectNetworkSpeedData()

	// 定时发送系统指标
	ticker := time.NewTicker(500 * time.Millisecond) // 改为500毫秒发送一次，更新更频繁
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

// 初始化网络统计数据
func initNetStats() {
	// 获取所有网络接口的IO统计信息
	stats, err := net.IOCounters(true)
	if err != nil {
		log.Printf("初始化网络统计数据失败: %v", err)
		return
	}

	// 转换为map以便查找
	lastNetStats = make(map[string]net.IOCountersStat)
	for _, stat := range stats {
		lastNetStats[stat.Name] = stat
	}
	lastNetTime = time.Now()

	log.Println("网络统计数据初始化完成")
}

// 单独收集网络速度数据，采样更频繁
func collectNetworkSpeedData() {
	ticker := time.NewTicker(200 * time.Millisecond) // 每200毫秒采样一次网络数据
	defer ticker.Stop()

	for range ticker.C {
		// 获取当前网络统计数据
		currentStats, err := net.IOCounters(true)
		if err != nil {
			log.Printf("获取网络统计信息失败: %v", err)
			continue
		}

		now := time.Now()
		elapsedSec := now.Sub(lastNetTime).Seconds()

		if elapsedSec > 0 && len(lastNetStats) > 0 {
			var totalBytesRecv uint64
			var totalBytesSent uint64
			var lastBytesRecv uint64
			var lastBytesSent uint64

			// 汇总所有接口的流量
			for _, stat := range currentStats {
				totalBytesRecv += stat.BytesRecv
				totalBytesSent += stat.BytesSent

				if lastStat, ok := lastNetStats[stat.Name]; ok {
					lastBytesRecv += lastStat.BytesRecv
					lastBytesSent += lastStat.BytesSent
				}
			}

			// 计算即时速率 (KB/s)
			var downloadSpeed, uploadSpeed float64

			// 处理计数器重置的情况
			if totalBytesRecv >= lastBytesRecv {
				downloadSpeed = float64(totalBytesRecv-lastBytesRecv) / elapsedSec / 1024
			} else {
				// 只在计数器重置时输出日志
				log.Printf("检测到接收计数器重置")
				downloadSpeed = float64(totalBytesRecv) / elapsedSec / 1024
			}

			if totalBytesSent >= lastBytesSent {
				uploadSpeed = float64(totalBytesSent-lastBytesSent) / elapsedSec / 1024
			} else {
				// 只在计数器重置时输出日志
				log.Printf("检测到发送计数器重置")
				uploadSpeed = float64(totalBytesSent) / elapsedSec / 1024
			}

			// 更新历史数据队列
			if len(downloadSpeedHistory) >= speedHistorySize {
				downloadSpeedHistory = downloadSpeedHistory[1:]
			}
			downloadSpeedHistory = append(downloadSpeedHistory, downloadSpeed)

			if len(uploadSpeedHistory) >= speedHistorySize {
				uploadSpeedHistory = uploadSpeedHistory[1:]
			}
			uploadSpeedHistory = append(uploadSpeedHistory, uploadSpeed)

			// 禁用瞬时网速日志输出，减少控制台输出量
			// log.Printf("瞬时下载速度: %.2f KB/s, 瞬时上传速度: %.2f KB/s", downloadSpeed, uploadSpeed)
		}

		// 更新统计数据以备下次使用
		lastNetStats = make(map[string]net.IOCountersStat)
		for _, stat := range currentStats {
			lastNetStats[stat.Name] = stat
		}
		lastNetTime = now
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

	// 获取所有磁盘的总容量和总已用空间
	var totalSpace uint64
	var usedSpace uint64

	partitions, err := disk.Partitions(false)
	if err != nil {
		return metrics, fmt.Errorf("获取磁盘分区信息失败: %v", err)
	}

	for _, partition := range partitions {
		// 根据操作系统，跳过一些特殊的挂载点
		if runtime.GOOS == "windows" && partition.Fstype == "NTFS" ||
			runtime.GOOS != "windows" && (partition.Fstype == "ext4" || partition.Fstype == "xfs") {
			usage, err := disk.Usage(partition.Mountpoint)
			if err != nil {
				log.Printf("获取磁盘 %s 使用情况失败: %v", partition.Mountpoint, err)
				continue
			}
			totalSpace += usage.Total
			usedSpace += usage.Used
		}
	}

	if totalSpace > 0 {
		// 计算总体使用率
		metrics.DiskUsage = float64(usedSpace) * 100.0 / float64(totalSpace)
	}

	// 使用历史数据计算平滑的网速
	if len(downloadSpeedHistory) > 0 {
		// 计算平均值
		var sum float64
		for _, v := range downloadSpeedHistory {
			sum += v
		}
		// 偏向最新数据的加权平均
		if len(downloadSpeedHistory) >= 2 {
			// 最新数据权重更高
			metrics.DownloadSpeed = (downloadSpeedHistory[len(downloadSpeedHistory)-1] * 0.7) +
				(sum / float64(len(downloadSpeedHistory)) * 0.3)
		} else {
			metrics.DownloadSpeed = sum / float64(len(downloadSpeedHistory))
		}
	}

	if len(uploadSpeedHistory) > 0 {
		// 计算平均值
		var sum float64
		for _, v := range uploadSpeedHistory {
			sum += v
		}
		// 偏向最新数据的加权平均
		if len(uploadSpeedHistory) >= 2 {
			// 最新数据权重更高
			metrics.UploadSpeed = (uploadSpeedHistory[len(uploadSpeedHistory)-1] * 0.7) +
				(sum / float64(len(uploadSpeedHistory)) * 0.3)
		} else {
			metrics.UploadSpeed = sum / float64(len(uploadSpeedHistory))
		}
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
