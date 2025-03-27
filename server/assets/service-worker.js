const CACHE_NAME = 'gonitor-v1';
const STATIC_CACHE_NAME = 'gonitor-static-v1';
const API_CACHE_NAME = 'gonitor-api-v1';

const STATIC_URLS_TO_CACHE = [
    '/',
    '/assets/css/styles.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

const API_URLS_TO_CACHE = [
    '/api/clients',
    '/api/login',
    '/api/logout'
];

// 安装Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE_NAME)
                .then(cache => cache.addAll(STATIC_URLS_TO_CACHE)),
            caches.open(API_CACHE_NAME)
                .then(cache => cache.addAll(API_URLS_TO_CACHE))
        ])
    );
});

// 激活Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 处理请求
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // 处理API请求
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            handleApiRequest(event.request)
        );
        return;
    }
    
    // 处理静态资源请求
    event.respondWith(
        handleStaticRequest(event.request)
    );
});

// 处理API请求的策略：网络优先，失败后使用缓存
async function handleApiRequest(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(API_CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// 处理静态资源请求的策略：缓存优先，失败后使用网络
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(STATIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        throw error;
    }
} 