const { createApp, ref, reactive, onMounted, computed } = Vue;

// 添加获取Cookie的辅助函数
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

// 获取当前URL中的端口号，用于示例命令
function getServerPort() {
    const port = window.location.port || '44123'; // 默认端口
    return port;
}

// 创建Vue应用
const app = createApp({
    components: {
        draggable: vuedraggable
    },
    setup() {
        // 状态变量
        const isLoggedIn = ref(false);
        const username = ref('');
        const clients = ref([]);
        const clientsLoaded = ref(false); // 新增：标记客户端数据是否已加载
        const loginForm = reactive({ username: '', password: '' });
        const loginError = ref('');
        const isLoggingIn = ref(false);
        const settingsForm = reactive({ username: '', oldPassword: '', newPassword: '', confirmPassword: '' });
        const settingsError = ref('');
        const settingsSuccess = ref('');
        const isSavingSettings = ref(false);
        const newClientForm = reactive({ name: '' });
        const addClientError = ref('');
        const isAddingClient = ref(false);
        const clientToDelete = ref(null);
        const isDeletingClient = ref(false);
        const newClientId = ref('');
        const serverPort = ref(getServerPort());
        const clientsForSort = ref([]);
        const isSortingClients = ref(false);
        // 主题相关状态
        const currentTheme = ref(localStorage.getItem('theme') || 'auto');
        // 通知提示
        const notification = reactive({
            show: false,
            message: '',
            type: 'success',
            icon: 'bi-check-circle-fill',
            timer: null
        });
        // 重命名相关状态
        const clientToRename = ref(null);
        const renameForm = reactive({ name: '' });
        const renameError = ref('');
        const isRenaming = ref(false);

        // 模态框实例
        let loginModal, settingsModal, addClientModal, deleteClientModal, clientIdModal, sortClientsModal, renameClientModal;

        // 初始化Bootstrap模态框
        const initModals = () => {
            loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
            addClientModal = new bootstrap.Modal(document.getElementById('addClientModal'));
            deleteClientModal = new bootstrap.Modal(document.getElementById('deleteClientModal'));
            clientIdModal = new bootstrap.Modal(document.getElementById('clientIdModal'));
            sortClientsModal = new bootstrap.Modal(document.getElementById('sortClientsModal'));
            renameClientModal = new bootstrap.Modal(document.getElementById('renameClientModal'));
        };

        // 拖拽选项
        const dragOptions = computed(() => {
            return {
                animation: 200,
                group: 'clients',
                disabled: !isLoggedIn.value,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen'
            };
        });

        // 检查登录状态
        const checkLoginStatus = async () => {
            try {
                // 首先检查localStorage中是否有登录状态
                const storedLoginStatus = localStorage.getItem('isLoggedIn');
                const storedUsername = localStorage.getItem('username');
                
                if (storedLoginStatus === 'true' && storedUsername) {
                    // console.log('从localStorage恢复登录状态');
                    isLoggedIn.value = true;
                    username.value = storedUsername;
                } else {
                    // 如果localStorage中没有，则检查Cookie
                    const sessionCookie = getCookie('session');
                    // console.log('会话Cookie:', sessionCookie);
                    
                    if (sessionCookie) {
                        isLoggedIn.value = true;
                        username.value = 'admin'; // 默认管理员用户名
                        // console.log('通过Cookie检测到用户已登录');
                        
                        // 同步到localStorage
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('username', 'admin');
                    } else {
                        isLoggedIn.value = false;
                        // console.log('未检测到登录状态');
                    }
                }
                
                // 无论如何都获取客户端数据
                const response = await fetch('/api/clients', {
                    credentials: 'include' // 确保发送Cookie
                });
                
                let data = await response.json();
                // console.log('获取到客户端数据:', data);
                
                // 立即按displayOrder排序，避免闪烁
                const hasDisplayOrder = data.some(client => client.displayOrder !== undefined);
                if (hasDisplayOrder) {
                    data.sort((a, b) => {
                        if (a.displayOrder === undefined) return 1;
                        if (b.displayOrder === undefined) return -1;
                        return a.displayOrder - b.displayOrder;
                    });
                    // console.log('初始加载时按displayOrder排序');
                }
                
                // 更新客户端列表
                clients.value = data;
                clientsLoaded.value = true; // 标记客户端数据已加载
                
                // 如果已登录但数据中没有ID，可能是服务器端会话已过期
                if (isLoggedIn.value && data.length > 0 && !data.some(client => client.id)) {
                    // console.log('服务器端会话可能已过期，需要重新登录');
                    
                    // 尝试自动重新登录一次
                    const reloginResponse = await fetch('/api/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            username: username.value || 'admin',
                            password: 'admin' // 使用默认密码尝试重新登录
                        })
                    });
                    
                    if (!reloginResponse.ok) {
                        // 如果重新登录失败，清除登录状态
                        isLoggedIn.value = false;
                        username.value = '';
                        localStorage.removeItem('isLoggedIn');
                        localStorage.removeItem('username');
                        // console.log('重新登录失败，已清除登录状态');
                    } else {
                        // console.log('自动重新登录成功');
                        // 重新获取客户端数据
                        await fetchClients();
                    }
                }
            } catch (error) {
                // console.error('获取客户端信息失败:', error);
            }
        };

        // 获取客户端数据
        const fetchClients = async () => {
            try {
                const response = await fetch('/api/clients', {
                    credentials: 'include'  // 确保发送Cookie
                });
                let data = await response.json();
                
                // 先检查是否有客户端具有displayOrder字段
                const hasDisplayOrder = data.some(client => client.displayOrder !== undefined);
                
                if (hasDisplayOrder) {
                    // 按displayOrder排序（服务器端的排序字段）
                    data.sort((a, b) => {
                        if (a.displayOrder === undefined) return 1;
                        if (b.displayOrder === undefined) return -1;
                        return a.displayOrder - b.displayOrder;
                    });
                    // console.log('使用服务器返回的displayOrder排序');
                } 
                // 如果无法从服务器获取排序信息，则保持本地排序
                else if (clients.value.length > 0) {
                    // 创建ID到索引的映射
                    const orderMap = {};
                    clients.value.forEach((client, index) => {
                        if (client.id) {
                            orderMap[client.id] = index;
                        }
                    });
                    
                    data.sort((a, b) => {
                        if (a.id in orderMap && b.id in orderMap) {
                            return orderMap[a.id] - orderMap[b.id];
                        } else if (a.id in orderMap) {
                            return -1;
                        } else if (b.id in orderMap) {
                            return 1;
                        }
                        return 0;
                    });
                    // console.log('使用本地排序顺序');
                }
                
                // 更新客户端列表
                clients.value = data;
            } catch (error) {
                // console.error('获取客户端信息失败:', error);
            }
        };

        // 开始实时更新
        const startRealTimeUpdates = () => {
            // 初始数据加载完成的标志
            let initialDataLoaded = false;
            
            // 每1秒更新一次客户端数据，保证实时性但不影响排序
            setInterval(async () => {
                // 确保初始数据已经排序好后再开始更新
                if (!initialDataLoaded && clients.value.length > 0) {
                    initialDataLoaded = true;
                    // console.log('初始数据已加载，开始实时更新');
                }
                
                if (!initialDataLoaded) {
                    return; // 如果初始数据还未加载完成，不执行更新
                }
                
                // 直接获取数据但不立即更新视图
                try {
                    const response = await fetch('/api/clients', {
                        credentials: 'include'  // 确保发送Cookie
                    });
                    let newData = await response.json();
                    
                    // 先检查是否有客户端具有displayOrder字段
                    const hasDisplayOrder = newData.some(client => client.displayOrder !== undefined);
                    
                    if (hasDisplayOrder) {
                        // 按displayOrder排序（服务器端的排序字段）
                        newData.sort((a, b) => {
                            if (a.displayOrder === undefined) return 1;
                            if (b.displayOrder === undefined) return -1;
                            return a.displayOrder - b.displayOrder;
                        });
                    } 
                    // 如果无法从服务器获取排序信息，则保持本地排序
                    else if (clients.value.length > 0) {
                        // 创建ID到索引的映射
                        const orderMap = {};
                        clients.value.forEach((client, index) => {
                            if (client.id) {
                                orderMap[client.id] = index;
                            }
                        });
                        
                        newData.sort((a, b) => {
                            if (a.id in orderMap && b.id in orderMap) {
                                return orderMap[a.id] - orderMap[b.id];
                            } else if (a.id in orderMap) {
                                return -1;
                            } else if (b.id in orderMap) {
                                return 1;
                            }
                            return 0;
                        });
                    }
                    
                    // 更新客户端数据
                    clients.value = newData;
                    if (!clientsLoaded.value) {
                        clientsLoaded.value = true;
                    }
                } catch (error) {
                    // console.error('更新客户端数据失败:', error);
                }
            }, 1000);
        };

        // 根据使用率获取进度条样式
        const getProgressBarClass = (value) => {
            if (value < 50) return 'progress-low';
            if (value < 80) return 'progress-medium';
            return 'progress-high';
        };

        // 格式化网络速度显示
        const formatNetworkSpeed = (speed) => {
            if (speed >= 1024) {
                return (speed / 1024).toFixed(2) + ' MB/s';
            } else {
                return speed.toFixed(2) + ' KB/s';
            }
        };
        
        // 计算网络速度进度条百分比（用于显示）
        const getNetworkSpeedPercent = (speed) => {
            // 最大值设为10 MB/s (10240 KB/s)，超过这个值显示100%
            const maxSpeed = 10240;
            if (speed >= maxSpeed) return 100;
            
            // 低于最大值时，按比例显示
            return (speed / maxSpeed) * 100;
        };

        // 登录相关函数
        const showLoginModal = () => {
            loginForm.username = '';
            loginForm.password = '';
            loginError.value = '';
            loginModal.show();
        };

        const login = async () => {
            if (!loginForm.username || !loginForm.password) {
                loginError.value = '请输入用户名和密码';
                return;
            }

            isLoggingIn.value = true;
            loginError.value = '';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送和接收Cookie
                    body: JSON.stringify({
                        username: loginForm.username,
                        password: loginForm.password
                    })
                });

                if (response.ok) {
                    // console.log('登录成功');
                    
                    // 同时在localStorage中保存登录状态
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('username', loginForm.username);
                    
                    // 检查Cookie是否设置成功
                    setTimeout(() => {
                        const sessionCookie = getCookie('session');
                        // console.log('登录后Cookie:', sessionCookie);
                        if (sessionCookie) {
                            // console.log('Cookie设置成功');
                        } else {
                            // console.warn('Cookie设置失败');
                        }
                    }, 100);
                    
                    isLoggedIn.value = true;
                    username.value = loginForm.username;
                    loginModal.hide();
                    
                    // 延迟一点时间再获取客户端数据，确保Cookie已设置
                    setTimeout(async () => {
                        // console.log('重新加载客户端数据');
                        await fetchClients(); // 重新获取客户端数据，包括ID
                        // console.log('客户端数据已更新');
                    }, 300);
                } else {
                    const data = await response.text();
                    loginError.value = data || '用户名或密码不正确';
                }
            } catch (error) {
                // console.error('登录失败:', error);
                loginError.value = '网络错误，请稍后重试';
            } finally {
                isLoggingIn.value = false;
            }
        };

        const logout = async () => {
            try {
                await fetch('/api/logout', {
                    credentials: 'include' // 确保发送Cookie
                });
                
                // 手动删除前端的Cookie
                document.cookie = 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                
                // 清除localStorage中的登录状态
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                
                isLoggedIn.value = false;
                username.value = '';
                clientsLoaded.value = false; // 重置客户端加载状态
                
                // 重新获取客户端数据（不含敏感信息）
                await fetchClients();
                // console.log('成功登出，已清除Cookie');
            } catch (error) {
                // console.error('登出失败:', error);
            }
        };

        // 设置相关函数
        const showSettingsModal = () => {
            settingsForm.username = username.value;
            settingsForm.oldPassword = '';
            settingsForm.newPassword = '';
            settingsError.value = '';
            settingsSuccess.value = '';
            settingsModal.show();
        };

        const saveSettings = async () => {
            // 表单验证
            if (!settingsForm.username || !settingsForm.oldPassword || !settingsForm.newPassword || !settingsForm.confirmPassword) {
                settingsError.value = '请填写所有必填字段';
                return;
            }

            if (settingsForm.newPassword !== settingsForm.confirmPassword) {
                settingsError.value = '新密码和确认密码不匹配';
                return;
            }

            // 设置加载状态
            isSavingSettings.value = true;
            settingsError.value = '';
            settingsSuccess.value = '';
            
            // 准备请求数据
            const requestData = {
                username: settingsForm.username,
                oldPassword: settingsForm.oldPassword,
                newPassword: settingsForm.newPassword
            };
            
            // console.log('发送修改密码请求:', JSON.stringify(requestData));

            try {
                // 发送请求
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送Cookie
                    body: JSON.stringify(requestData)
                });

                // 记录响应状态
                const responseStatus = response.status;
                const responseStatusText = response.statusText;
                // console.log(`修改密码响应状态: ${responseStatus} ${responseStatusText}`);
                
                // 尝试读取响应文本
                let responseText = '';
                try {
                    responseText = await response.text();
                    // console.log('修改密码响应内容:', responseText);
                } catch (e) {
                    // console.error('解析响应文本失败:', e);
                }
                
                // 处理响应
                if (response.ok) {
                    let jsonResponse = null;
                    
                    // 尝试解析JSON
                    try {
                        if (responseText) {
                            jsonResponse = JSON.parse(responseText);
                            // console.log('解析的JSON响应:', jsonResponse);
                        }
                    } catch (e) {
                        // console.error('响应JSON解析失败:', e);
                    }
                    
                    // 设置成功消息
                    settingsSuccess.value = (jsonResponse && jsonResponse.message) ? jsonResponse.message : '设置已保存';
                    
                    // 更新用户名
                    username.value = settingsForm.username;
                    
                    // 更新localStorage中的用户名
                    if (localStorage.getItem('isLoggedIn') === 'true') {
                        localStorage.setItem('username', settingsForm.username);
                    }
                    
                    // 重置表单
                    settingsForm.oldPassword = '';
                    settingsForm.newPassword = '';
                    settingsForm.confirmPassword = '';
                    
                    // 延迟关闭模态框
                    setTimeout(() => {
                        settingsSuccess.value = '';
                        settingsModal.hide();
                    }, 1500);
                } else {
                    // 处理错误响应
                    try {
                        const errorJson = JSON.parse(responseText);
                        settingsError.value = errorJson.error || '保存设置失败';
                    } catch (e) {
                        // 如果响应不是JSON格式，直接使用文本
                        settingsError.value = responseText || `保存设置失败，状态码: ${responseStatus}`;
                    }
                }
            } catch (error) {
                // 网络或其他错误
                // console.error('保存设置失败:', error);
                settingsError.value = '网络错误，请稍后重试';
            } finally {
                // 无论成功或失败都重置加载状态
                isSavingSettings.value = false;
            }
        };

        // 客户端管理相关函数
        const showAddClientModal = () => {
            newClientForm.name = '';
            addClientError.value = '';
            addClientModal.show();
        };

        const addClient = async () => {
            if (!newClientForm.name) {
                addClientError.value = '请输入客户端名称';
                return;
            }

            isAddingClient.value = true;
            addClientError.value = '';

            try {
                const response = await fetch('/api/clients/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送Cookie
                    body: JSON.stringify({
                        name: newClientForm.name
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    newClientId.value = data.id;
                    addClientModal.hide();
                    await fetchClients();
                    clientIdModal.show();
                } else {
                    const data = await response.text();
                    addClientError.value = data || '添加客户端失败';
                }
            } catch (error) {
                // console.error('添加客户端失败:', error);
                addClientError.value = '网络错误，请稍后重试';
            } finally {
                isAddingClient.value = false;
            }
        };

        const confirmDeleteClient = (client) => {
            clientToDelete.value = client;
            deleteClientModal.show();
        };

        const deleteClient = async () => {
            if (!clientToDelete.value) return;

            isDeletingClient.value = true;

            try {
                const response = await fetch('/api/clients/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送Cookie
                    body: JSON.stringify({
                        id: clientToDelete.value.id
                    })
                });

                if (response.ok) {
                    deleteClientModal.hide();
                    await fetchClients();
                } else {
                    // console.error('删除客户端失败:', await response.text());
                }
            } catch (error) {
                // console.error('删除客户端失败:', error);
            } finally {
                isDeletingClient.value = false;
                clientToDelete.value = null;
            }
        };

        // 显示全局通知
        const showNotification = (message, type = 'success', duration = 3000) => {
            // 清除之前的定时器
            if (notification.timer) {
                clearTimeout(notification.timer);
            }
            
            // 设置图标
            let icon = 'bi-check-circle-fill';
            if (type === 'error') icon = 'bi-exclamation-circle-fill';
            else if (type === 'warning') icon = 'bi-exclamation-triangle-fill';
            else if (type === 'info') icon = 'bi-info-circle-fill';
            
            // 更新通知状态
            notification.message = message;
            notification.type = type;
            notification.icon = icon;
            notification.show = true;
            
            // 设置自动隐藏
            notification.timer = setTimeout(() => {
                notification.show = false;
            }, duration);
        };
        
        // 复制客户端ID到剪贴板 (更新)
        const copyClientId = () => {
            if (newClientId.value) {
                navigator.clipboard.writeText(newClientId.value)
                    .then(() => {
                        showNotification('客户端ID已复制到剪贴板', 'success');
                    })
                    .catch(err => {
                        console.error('复制失败:', err);
                        showNotification('复制失败，请手动复制', 'error');
                    });
            }
        };

        // 通用复制到剪贴板函数，支持动画反馈 (更新)
        const copyToClipboard = (text, event) => {
            if (!text) return;
            
            navigator.clipboard.writeText(text)
                .then(() => {
                    // 显示复制成功提示
                    const tooltip = event.target.parentNode.querySelector('.copy-tooltip');
                    if (tooltip) {
                        tooltip.classList.add('show');
                        setTimeout(() => {
                            tooltip.classList.remove('show');
                        }, 1500);
                    }
                    
                    // 显示全局通知
                    showNotification('客户端ID已复制到剪贴板', 'success');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                    showNotification('复制失败，请手动复制', 'error');
                });
        };

        // 处理拖拽排序变更
        const onDragChange = async () => {
            // 如果不是登录状态，不处理排序
            if (!isLoggedIn.value) return;
            
            // 更新客户端数组中的displayOrder字段
            clients.value.forEach((client, index) => {
                if (client.id) {
                    client.displayOrder = index + 1;
                }
            });
            
            // 生成排序映射
            const orders = {};
            clients.value.forEach((client, index) => {
                if (client.id) {
                    orders[client.id] = index + 1; // 排序从1开始
                }
            });
            
            // 发送排序更新请求
            try {
                await fetch('/api/clients/reorder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送Cookie
                    body: JSON.stringify({
                        orders: orders
                    })
                });
                // console.log('拖拽排序已保存到服务器');
            } catch (error) {
                // console.error('更新排序失败:', error);
            }
        };

        // 显示排序模态框
        const showSortClientsModal = () => {
            // 克隆客户端数据
            clientsForSort.value = clients.value.map(client => ({...client}));
            
            // 在下一个事件循环中显示模态框，确保数据更新
            setTimeout(() => {
                sortClientsModal.show();
            }, 0);
        };

        // 保存客户端排序
        const saveClientOrder = async () => {
            isSortingClients.value = true;
            
            try {
                // 生成排序映射 - 将索引作为displayOrder值
                const orders = {};
                clientsForSort.value.forEach((client, index) => {
                    if (client.id) {
                        orders[client.id] = index + 1; // 排序从1开始
                    }
                });
                
                // 发送排序更新请求
                const response = await fetch('/api/clients/reorder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // 确保发送Cookie
                    body: JSON.stringify({
                        orders: orders
                    })
                });
                
                if (response.ok) {
                    // 更新主界面的排序
                    // 1. 保留原有数据的最新值
                    const clientMap = {};
                    clients.value.forEach(client => {
                        if (client.id) clientMap[client.id] = { ...client };
                    });
                    
                    // 2. 使用排序后的ID顺序创建新数组
                    const newClientsArray = clientsForSort.value.map((sortClient, index) => {
                        if (sortClient.id && clientMap[sortClient.id]) {
                            // 返回最新数据，同时更新displayOrder
                            return { 
                                ...clientMap[sortClient.id],
                                displayOrder: index + 1 // 确保displayOrder字段与新排序一致
                            };
                        }
                        return { ...sortClient, displayOrder: index + 1 };
                    });
                    
                    // 3. 更新客户端数组
                    clients.value = newClientsArray;
                    sortClientsModal.hide();
                    // console.log('排序已保存并应用，重新加载页面或重新登录后仍会保持此排序');
                }
            } catch (error) {
                // console.error('保存排序失败:', error);
            } finally {
                isSortingClients.value = false;
            }
        };

        // 向上移动项目
        const moveItemUp = (index) => {
            if (index <= 0) return;
            const temp = clientsForSort.value[index];
            clientsForSort.value[index] = clientsForSort.value[index - 1];
            clientsForSort.value[index - 1] = temp;
        };

        // 向下移动项目
        const moveItemDown = (index) => {
            if (index >= clientsForSort.value.length - 1) return;
            const temp = clientsForSort.value[index];
            clientsForSort.value[index] = clientsForSort.value[index + 1];
            clientsForSort.value[index + 1] = temp;
        };

        // 主题相关函数
        const getSystemTheme = () => {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        };
        
        const applyTheme = (theme) => {
            let appliedTheme = theme;
            if (theme === 'auto') {
                appliedTheme = getSystemTheme();
            }
            document.documentElement.setAttribute('data-theme', appliedTheme);
        };
        
        const setTheme = (theme) => {
            currentTheme.value = theme;
            localStorage.setItem('theme', theme);
            applyTheme(theme);
        };

        // 显示重命名客户端模态框
        const showRenameClientModal = (client) => {
            clientToRename.value = client;
            renameForm.name = client.name;
            renameError.value = '';
            isRenaming.value = false;
            renameClientModal.show();
        };
        
        // 重命名客户端
        const renameClient = async () => {
            // 验证名称
            if (!renameForm.name.trim()) {
                renameError.value = '请输入客户端名称';
                return;
            }
            
            // 设置加载状态
            isRenaming.value = true;
            renameError.value = '';
            
            try {
                // 发送重命名请求
                const response = await fetch('/api/clients/rename', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: clientToRename.value.id,
                        name: renameForm.name.trim()
                    }),
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // 更新本地客户端数据
                    const clientIndex = clients.value.findIndex(c => c.id === clientToRename.value.id);
                    if (clientIndex !== -1) {
                        clients.value[clientIndex].name = renameForm.name.trim();
                    }
                    
                    // 关闭模态框
                    renameClientModal.hide();
                    
                    // 显示成功通知
                    showNotification('客户端重命名成功', 'success');
                } else {
                    // 显示错误信息
                    renameError.value = data.error || '重命名失败，请重试';
                }
            } catch (error) {
                console.error('重命名客户端出错:', error);
                renameError.value = '网络错误，请重试';
            } finally {
                isRenaming.value = false;
            }
        };

        // 初始化应用
        onMounted(() => {
            // 初始化模态框
            initModals();
            
            // 异步加载数据并启动实时更新
            const initApp = async () => {
                // 先检查登录状态并获取初始数据
                await checkLoginStatus();
                // 确保数据加载完成后才启动实时更新
                startRealTimeUpdates();
            };
            
            // 执行初始化
            initApp();
            
            // 监听系统主题变化
            if (window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                    if (currentTheme.value === 'auto') {
                        applyTheme('auto');
                    }
                });
            }
        });

        return {
            isLoggedIn,
            username,
            clients,
            clientsLoaded,
            loginForm,
            loginError,
            isLoggingIn,
            settingsForm,
            settingsError,
            settingsSuccess,
            isSavingSettings,
            newClientForm,
            addClientError,
            isAddingClient,
            clientToDelete,
            isDeletingClient,
            newClientId,
            serverPort,
            clientsForSort,
            isSortingClients,
            currentTheme,
            notification,
            clientToRename,
            renameForm,
            renameError,
            isRenaming,
            dragOptions,
            getProgressBarClass,
            showLoginModal,
            login,
            logout,
            showSettingsModal,
            saveSettings,
            showAddClientModal,
            addClient,
            confirmDeleteClient,
            deleteClient,
            copyClientId,
            getProgressBarClass,
            showSortClientsModal,
            saveClientOrder,
            moveItemUp,
            moveItemDown,
            onDragChange,
            setTheme,
            copyToClipboard,
            showRenameClientModal,
            renameClient,
            formatNetworkSpeed,
            getNetworkSpeedPercent
        };
    }
});

app.mount('#app'); 