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

        // 模态框实例
        let loginModal, settingsModal, addClientModal, deleteClientModal, clientIdModal;

        // 初始化Bootstrap模态框
        const initModals = () => {
            loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
            addClientModal = new bootstrap.Modal(document.getElementById('addClientModal'));
            deleteClientModal = new bootstrap.Modal(document.getElementById('deleteClientModal'));
            clientIdModal = new bootstrap.Modal(document.getElementById('clientIdModal'));
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
                    console.log('从localStorage恢复登录状态');
                    isLoggedIn.value = true;
                    username.value = storedUsername;
                } else {
                    // 如果localStorage中没有，则检查Cookie
                    const sessionCookie = getCookie('session');
                    console.log('会话Cookie:', sessionCookie);
                    
                    if (sessionCookie) {
                        isLoggedIn.value = true;
                        username.value = 'admin'; // 默认管理员用户名
                        console.log('通过Cookie检测到用户已登录');
                        
                        // 同步到localStorage
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('username', 'admin');
                    } else {
                        isLoggedIn.value = false;
                        console.log('未检测到登录状态');
                    }
                }
                
                // 无论如何都获取客户端数据
                const response = await fetch('/api/clients', {
                    credentials: 'include' // 确保发送Cookie
                });
                
                const data = await response.json();
                console.log('获取到客户端数据:', data);
                
                // 如果已登录但数据中没有ID，可能是服务器端会话已过期
                if (isLoggedIn.value && data.length > 0 && !data.some(client => client.id)) {
                    console.log('服务器端会话可能已过期，需要重新登录');
                    
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
                        console.log('重新登录失败，已清除登录状态');
                    } else {
                        console.log('自动重新登录成功');
                        // 重新获取客户端数据
                        await fetchClients();
                    }
                }
                
                // 更新客户端列表
                clients.value = data;
            } catch (error) {
                console.error('获取客户端信息失败:', error);
            }
        };

        // 获取客户端数据
        const fetchClients = async () => {
            try {
                const response = await fetch('/api/clients', {
                    credentials: 'include'  // 确保发送Cookie
                });
                const data = await response.json();
                clients.value = data;
            } catch (error) {
                console.error('获取客户端信息失败:', error);
            }
        };

        // 开始实时更新
        const startRealTimeUpdates = () => {
            // 每秒更新一次客户端数据
            setInterval(fetchClients, 1000);
        };

        // 根据使用率获取进度条样式
        const getProgressBarClass = (value) => {
            if (value < 30) return 'progress-low';
            if (value < 70) return 'progress-medium';
            return 'progress-high';
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
                    console.log('登录成功');
                    
                    // 同时在localStorage中保存登录状态
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('username', loginForm.username);
                    
                    // 检查Cookie是否设置成功
                    setTimeout(() => {
                        const sessionCookie = getCookie('session');
                        console.log('登录后Cookie:', sessionCookie);
                        if (sessionCookie) {
                            console.log('Cookie设置成功');
                        } else {
                            console.warn('Cookie设置失败');
                        }
                    }, 100);
                    
                    isLoggedIn.value = true;
                    username.value = loginForm.username;
                    loginModal.hide();
                    
                    // 延迟一点时间再获取客户端数据，确保Cookie已设置
                    setTimeout(async () => {
                        console.log('重新加载客户端数据');
                        await fetchClients(); // 重新获取客户端数据，包括ID
                        console.log('客户端数据已更新');
                    }, 300);
                } else {
                    const data = await response.text();
                    loginError.value = data || '用户名或密码不正确';
                }
            } catch (error) {
                console.error('登录失败:', error);
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
                await fetchClients(); // 重新获取客户端数据，不包括ID
                console.log('成功登出，已清除Cookie');
            } catch (error) {
                console.error('登出失败:', error);
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
            
            console.log('发送修改密码请求:', JSON.stringify(requestData));

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
                console.log(`修改密码响应状态: ${responseStatus} ${responseStatusText}`);
                
                // 尝试读取响应文本
                let responseText = '';
                try {
                    responseText = await response.text();
                    console.log('修改密码响应内容:', responseText);
                } catch (e) {
                    console.error('解析响应文本失败:', e);
                }
                
                // 处理响应
                if (response.ok) {
                    let jsonResponse = null;
                    
                    // 尝试解析JSON
                    try {
                        if (responseText) {
                            jsonResponse = JSON.parse(responseText);
                            console.log('解析的JSON响应:', jsonResponse);
                        }
                    } catch (e) {
                        console.error('响应JSON解析失败:', e);
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
                console.error('保存设置失败:', error);
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
                console.error('添加客户端失败:', error);
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
                    console.error('删除客户端失败:', await response.text());
                }
            } catch (error) {
                console.error('删除客户端失败:', error);
            } finally {
                isDeletingClient.value = false;
                clientToDelete.value = null;
            }
        };

        // 复制客户端ID到剪贴板
        const copyClientId = () => {
            const input = document.querySelector('#clientIdModal input');
            input.select();
            document.execCommand('copy');
            alert('ID已复制到剪贴板');
        };

        // 处理拖拽排序变更
        const onDragChange = async () => {
            // 如果不是登录状态，不处理排序
            if (!isLoggedIn.value) return;
            
            // 生成排序映射
            const orders = {};
            clients.value.forEach((client, index) => {
                if (client.id) {
                    orders[client.id] = index + 1;
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
            } catch (error) {
                console.error('更新排序失败:', error);
            }
        };

        // 组件挂载完成后执行
        onMounted(() => {
            initModals();
            
            // 首次加载时给一点延迟，确保所有组件加载完成
            setTimeout(() => {
                checkLoginStatus();
            }, 100);
            
            startRealTimeUpdates();
        });

        return {
            isLoggedIn,
            username,
            clients,
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
            onDragChange
        };
    }
});

app.mount('#app'); 