const { createApp, ref, reactive, onMounted, computed } = Vue;

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
        const settingsForm = reactive({ username: '', oldPassword: '', newPassword: '' });
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
                const response = await fetch('/api/clients');
                const data = await response.json();
                
                // 检查是否有ID（只有登录用户才能看到ID）
                if (data.length > 0 && data[0].id) {
                    isLoggedIn.value = true;
                    // 从cookie中获取用户名（实际项目中可能需要从服务器获取）
                    username.value = 'admin';
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
                const response = await fetch('/api/clients');
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
                    body: JSON.stringify({
                        username: loginForm.username,
                        password: loginForm.password
                    })
                });

                if (response.ok) {
                    isLoggedIn.value = true;
                    username.value = loginForm.username;
                    loginModal.hide();
                    await fetchClients(); // 重新获取客户端数据，包括ID
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
                await fetch('/api/logout');
                isLoggedIn.value = false;
                username.value = '';
                await fetchClients(); // 重新获取客户端数据，不包括ID
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
            if (!settingsForm.username || !settingsForm.oldPassword || !settingsForm.newPassword) {
                settingsError.value = '请填写所有必填字段';
                return;
            }

            isSavingSettings.value = true;
            settingsError.value = '';
            settingsSuccess.value = '';

            try {
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: settingsForm.username,
                        oldPassword: settingsForm.oldPassword,
                        newPassword: settingsForm.newPassword
                    })
                });

                if (response.ok) {
                    settingsSuccess.value = '设置已保存';
                    username.value = settingsForm.username;
                    setTimeout(() => {
                        settingsModal.hide();
                    }, 1500);
                } else {
                    const data = await response.text();
                    settingsError.value = data || '保存设置失败';
                }
            } catch (error) {
                console.error('保存设置失败:', error);
                settingsError.value = '网络错误，请稍后重试';
            } finally {
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
            checkLoginStatus();
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