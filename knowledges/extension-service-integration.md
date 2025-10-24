# 扩展与服务集成指南

本文档说明如何将 MyZ Annotator Chrome 扩展与后端服务集成，实现用户认证和数据同步功能。

## 架构概览

```
Chrome Extension (客户端)
    ↓
chrome.storage.local (本地存储)
    ↓
MyZ Service API (后端服务)
    ↓
PostgreSQL + 文件存储
```

## 集成步骤

### 1. 在扩展中添加服务配置

在 `extension/src/background.js` 中添加服务配置：

```javascript
const SERVICE_CONFIG = {
  baseUrl: 'http://localhost:3000/api', // 生产环境改为实际域名
  endpoints: {
    register: '/auth/register',
    login: '/auth/login',
    verifyEmail: '/auth/verify-email',
    profile: '/auth/profile',
    sync: '/sync/highlights',
    syncStatus: '/sync/status'
  }
};

const AUTH_TOKEN_KEY = 'myz::auth_token';
const USER_INFO_KEY = 'myz::user_info';
```

### 2. 添加认证相关的消息处理器

在 `background.js` 的 `messageHandlers` 中添加：

```javascript
const messageHandlers = {
  // ... 现有的处理器
  
  async "myz:register"(payload) {
    const { email, password } = payload;
    const response = await fetch(`${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.endpoints.register}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }
    
    const data = await response.json();
    await chrome.storage.local.set({
      [AUTH_TOKEN_KEY]: data.token,
      [USER_INFO_KEY]: data.user
    });
    
    return data;
  },

  async "myz:login"(payload) {
    const { email, password } = payload;
    const response = await fetch(`${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.endpoints.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    
    const data = await response.json();
    await chrome.storage.local.set({
      [AUTH_TOKEN_KEY]: data.token,
      [USER_INFO_KEY]: data.user
    });
    
    return data;
  },

  async "myz:logout"() {
    await chrome.storage.local.remove([AUTH_TOKEN_KEY, USER_INFO_KEY]);
    return { success: true };
  },

  async "myz:getAuthStatus"() {
    const { [AUTH_TOKEN_KEY]: token, [USER_INFO_KEY]: user } = 
      await chrome.storage.local.get([AUTH_TOKEN_KEY, USER_INFO_KEY]);
    
    return {
      isAuthenticated: !!token,
      user: user || null
    };
  },

  async "myz:syncToServer"() {
    const { [AUTH_TOKEN_KEY]: token } = await chrome.storage.local.get(AUTH_TOKEN_KEY);
    if (!token) {
      throw new Error('Not authenticated');
    }

    const state = await readState();
    const response = await fetch(`${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.endpoints.sync}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        highlights: state.highlights,
        deletedIds: []
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Sync failed');
    }

    const syncResult = await response.json();
    
    // 合并服务器数据
    if (syncResult.downloadData && Object.keys(syncResult.downloadData).length > 0) {
      for (const [id, highlight] of Object.entries(syncResult.downloadData)) {
        state.highlights[id] = highlight;
        if (!state.order.includes(id)) {
          state.order.push(id);
        }
      }
    }

    // 删除服务器标记的项
    if (syncResult.deleteIds && syncResult.deleteIds.length > 0) {
      for (const id of syncResult.deleteIds) {
        delete state.highlights[id];
        state.order = state.order.filter(orderId => orderId !== id);
      }
    }

    await writeState(state);
    return syncResult;
  }
};
```

### 3. 在设置页面添加账户管理

在 `extension/dashboard/dashboard.html` 的设置标签页中添加：

```html
<div class="settings-section">
  <h3>账户管理</h3>
  
  <div id="auth-status">
    <div id="logged-out-view">
      <p>登录或注册以启用云同步功能</p>
      <button id="show-login-btn">登录</button>
      <button id="show-register-btn">注册</button>
    </div>
    
    <div id="logged-in-view" style="display: none;">
      <p>已登录: <span id="user-email"></span></p>
      <p>邮箱状态: <span id="email-status"></span></p>
      <button id="sync-now-btn">立即同步</button>
      <button id="logout-btn">退出登录</button>
    </div>
  </div>
  
  <div id="login-form" style="display: none;">
    <h4>登录</h4>
    <input type="email" id="login-email" placeholder="邮箱" />
    <input type="password" id="login-password" placeholder="密码" />
    <button id="login-submit-btn">登录</button>
    <button id="cancel-login-btn">取消</button>
    <p><a href="#" id="use-oauth-google">使用 Google 登录</a></p>
    <p><a href="#" id="use-oauth-github">使用 GitHub 登录</a></p>
  </div>
  
  <div id="register-form" style="display: none;">
    <h4>注册</h4>
    <input type="email" id="register-email" placeholder="邮箱" />
    <input type="password" id="register-password" placeholder="密码 (至少8位)" />
    <button id="register-submit-btn">注册</button>
    <button id="cancel-register-btn">取消</button>
    <p><a href="#" id="register-oauth-google">使用 Google 注册</a></p>
    <p><a href="#" id="register-oauth-github">使用 GitHub 注册</a></p>
  </div>
</div>
```

### 4. 在 dashboard.js 中添加账户管理逻辑

```javascript
// 检查认证状态
async function checkAuthStatus() {
  const response = await chrome.runtime.sendMessage({
    type: 'myz:getAuthStatus'
  });
  
  if (response.ok && response.data.isAuthenticated) {
    document.getElementById('logged-out-view').style.display = 'none';
    document.getElementById('logged-in-view').style.display = 'block';
    document.getElementById('user-email').textContent = response.data.user.email;
    document.getElementById('email-status').textContent = 
      response.data.user.emailVerified ? '已验证 ✓' : '未验证 (请查看邮件)';
  } else {
    document.getElementById('logged-out-view').style.display = 'block';
    document.getElementById('logged-in-view').style.display = 'none';
  }
}

// 登录
document.getElementById('login-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'myz:login',
      payload: { email, password }
    });
    
    if (response.ok) {
      alert('登录成功！');
      document.getElementById('login-form').style.display = 'none';
      await checkAuthStatus();
    } else {
      alert('登录失败: ' + response.error);
    }
  } catch (error) {
    alert('登录错误: ' + error.message);
  }
});

// 注册
document.getElementById('register-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  if (password.length < 8) {
    alert('密码至少需要8个字符');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'myz:register',
      payload: { email, password }
    });
    
    if (response.ok) {
      alert('注册成功！请查看邮件验证您的账户。');
      document.getElementById('register-form').style.display = 'none';
      await checkAuthStatus();
    } else {
      alert('注册失败: ' + response.error);
    }
  } catch (error) {
    alert('注册错误: ' + error.message);
  }
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({
    type: 'myz:logout'
  });
  
  if (response.ok) {
    alert('已退出登录');
    await checkAuthStatus();
  }
});

// 立即同步
document.getElementById('sync-now-btn').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'myz:syncToServer'
    });
    
    if (response.ok) {
      alert(`同步成功！\n上传: ${response.data.stats.uploaded}\n下载: ${response.data.stats.downloaded}\n删除: ${response.data.stats.deleted}`);
    } else {
      alert('同步失败: ' + response.error);
    }
  } catch (error) {
    alert('同步错误: ' + error.message);
  }
});

// OAuth 登录
document.getElementById('use-oauth-google').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({
    url: 'http://localhost:3000/api/auth/google'
  });
});

document.getElementById('use-oauth-github').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({
    url: 'http://localhost:3000/api/auth/github'
  });
});

// 页面加载时检查认证状态
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});
```

### 5. 处理 OAuth 回调

在 `background.js` 中添加 OAuth 回调监听：

```javascript
// 监听 OAuth 回调
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('/auth/success?token=')) {
    try {
      const url = new URL(tab.url);
      const token = url.searchParams.get('token');
      
      if (token) {
        // 保存 token
        await chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token });
        
        // 获取用户信息
        const response = await fetch(`${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.endpoints.profile}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const user = await response.json();
          await chrome.storage.local.set({ [USER_INFO_KEY]: user });
        }
        
        // 关闭认证标签页
        chrome.tabs.remove(tabId);
        
        // 通知用户
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '../assets/icon128.png',
          title: 'MyZ Annotator',
          message: '登录成功！'
        });
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
    }
  }
});
```

### 6. 添加自动同步

在 `background.js` 中添加定期同步：

```javascript
// 每小时自动同步一次
const AUTO_SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  try {
    const { [AUTH_TOKEN_KEY]: token, [USER_INFO_KEY]: user } = 
      await chrome.storage.local.get([AUTH_TOKEN_KEY, USER_INFO_KEY]);
    
    // 只有在已认证且邮箱已验证时才同步
    if (token && user?.emailVerified) {
      await messageHandlers['myz:syncToServer']();
      console.log('Auto sync completed');
    }
  } catch (error) {
    console.error('Auto sync failed:', error);
  }
}, AUTO_SYNC_INTERVAL);
```

## 数据流说明

### 1. 注册/登录流程

```
用户输入 → Extension → Service API → 返回 JWT Token
                ↓
        保存到 chrome.storage.local
```

### 2. 同步流程

```
Extension 本地数据
    ↓
比较时间戳 → 确定需要上传/下载的数据
    ↓
发送到 Service API → 服务器处理冲突
    ↓
接收服务器响应 → 合并到本地存储
```

### 3. 冲突解决

使用"最后写入者胜出"策略：
- 比较 `updatedAt` 时间戳
- 较新的版本覆盖较旧的版本
- 客户端和服务器都遵循此规则

## 安全考虑

1. **Token 存储**：JWT token 存储在 `chrome.storage.local`，只有扩展可以访问
2. **HTTPS**：生产环境必须使用 HTTPS
3. **Token 刷新**：当前 token 有效期 7 天，可根据需要调整
4. **权限控制**：未验证邮箱的用户无法使用同步功能
5. **CORS**：服务器配置只允许扩展的域名访问

## 测试清单

- [ ] 用户可以注册新账户
- [ ] 注册后收到验证邮件
- [ ] 点击邮件链接后邮箱被验证
- [ ] 用户可以登录
- [ ] 登录后可以查看个人信息
- [ ] 验证邮箱后可以同步数据
- [ ] 同步上传本地数据到服务器
- [ ] 同步下载服务器数据到本地
- [ ] 冲突解决正确（最新版本胜出）
- [ ] 删除的数据正确同步
- [ ] OAuth 登录（Google）正常工作
- [ ] OAuth 登录（GitHub）正常工作
- [ ] 退出登录后无法访问同步功能
- [ ] 自动同步按预期工作

## 故障排除

### Token 验证失败
- 检查 token 是否正确保存
- 确认 JWT_SECRET 在服务器正确配置
- 检查 token 是否过期

### 同步失败
- 确认用户邮箱已验证
- 检查网络连接
- 查看服务器日志

### OAuth 回调失败
- 确认回调 URL 配置正确
- 检查 OAuth 客户端 ID 和密钥
- 确认用户授权了邮箱权限

## 后续优化

1. **离线支持**：使用队列机制，在离线时保存操作，联网后同步
2. **增量更新**：只传输变化的字段，减少数据量
3. **压缩**：对大量数据进行压缩传输
4. **错误重试**：实现指数退避重试机制
5. **Token 刷新**：在 token 过期前自动刷新
6. **冲突解决 UI**：允许用户手动解决冲突
7. **同步状态显示**：实时显示同步进度

## 参考资料

- [Service API 文档](./service-api.md)
- [Service 设置指南](../service/SETUP_GUIDE.md)
- [Extension README](../extension/README.md)
