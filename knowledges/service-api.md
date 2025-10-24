# MyZ Annotator Service API 文档

MyZ Annotator 后端服务提供用户认证、邮箱验证和数据同步功能。所有 API 端点的基础 URL 为：`http://localhost:3000/api`

## 目录

1. [认证流程](#认证流程)
2. [用户认证 API](#用户认证-api)
3. [OAuth 认证 API](#oauth-认证-api)
4. [数据同步 API](#数据同步-api)
5. [错误响应](#错误响应)
6. [使用示例](#使用示例)

## 认证流程

### 基本认证流程

1. **用户注册** → 收到验证邮件
2. **验证邮箱** → 点击邮件链接
3. **登录** → 获取 JWT token
4. **使用 token 访问受保护的 API**

### OAuth 认证流程

1. **重定向到第三方认证**
2. **用户授权后回调到服务器**
3. **服务器创建用户（如果不存在）并发送验证邮件**
4. **重定向回扩展并携带 token**
5. **验证邮箱后可使用完整功能**

## 用户认证 API

### 1. 注册新用户

**端点:** `POST /api/auth/register`

**请求头:**
```
Content-Type: application/json
```

**请求体:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**参数说明:**
- `email` (string, 必需): 用户邮箱地址，必须是有效的邮箱格式
- `password` (string, 必需): 密码，至少 8 个字符

**成功响应:** `201 Created`
```json
{
  "message": "Registration successful. Please check your email to verify your account.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

**错误响应:**
- `400 Bad Request`: 邮箱已注册或验证失败
- `500 Internal Server Error`: 服务器错误

**说明:**
- 注册成功后会自动发送验证邮件
- 返回的 token 可用于访问 API，但某些功能需要验证邮箱后才能使用
- 邮箱验证链接有效期为 24 小时

---

### 2. 用户登录

**端点:** `POST /api/auth/login`

**请求头:**
```
Content-Type: application/json
```

**请求体:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**参数说明:**
- `email` (string, 必需): 用户邮箱地址
- `password` (string, 必需): 用户密码

**成功响应:** `200 OK`
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**错误响应:**
- `401 Unauthorized`: 邮箱或密码错误
- `500 Internal Server Error`: 服务器错误

**说明:**
- 登录成功返回 JWT token
- token 默认有效期为 7 天
- 需要在后续请求的 `Authorization` 头中携带此 token

---

### 3. 验证邮箱

**端点:** `GET /api/auth/verify-email?token=<verification_token>`

**请求参数:**
- `token` (string, 必需): 从验证邮件中获取的验证 token

**成功响应:** `200 OK`
```json
{
  "message": "Email verified successfully"
}
```

**错误响应:**
- `400 Bad Request`: token 无效或已过期
- `500 Internal Server Error`: 服务器错误

**说明:**
- 验证成功后，用户可以使用需要邮箱验证的功能（如数据同步）
- 验证链接有效期为 24 小时
- token 只能使用一次

---

### 4. 重新发送验证邮件

**端点:** `POST /api/auth/resend-verification`

**请求头:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**成功响应:** `200 OK`
```json
{
  "message": "Verification email sent"
}
```

**错误响应:**
- `400 Bad Request`: 邮箱已验证
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器错误

**说明:**
- 仅未验证邮箱的用户可以调用此接口
- 会生成新的验证 token 并发送邮件

---

### 5. 获取用户信息

**端点:** `GET /api/auth/profile`

**请求头:**
```
Authorization: Bearer <your_jwt_token>
```

**成功响应:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "emailVerified": true,
  "authProvider": "local",
  "createdAt": "2025-10-24T08:00:00.000Z"
}
```

**错误响应:**
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器错误

**说明:**
- 返回当前登录用户的基本信息
- `authProvider` 可能的值：`local`, `google`, `github`

---

## OAuth 认证 API

### 6. Google 登录

**端点:** `GET /api/auth/google`

**说明:**
- 重定向到 Google 授权页面
- 用户授权后会回调到 `/api/auth/google/callback`
- 成功后重定向到 `${FRONTEND_URL}/auth/success?token=<jwt_token>`
- 失败时重定向到 `/api/auth/failure`

**使用示例:**
```html
<a href="http://localhost:3000/api/auth/google">使用 Google 登录</a>
```

---

### 7. Google 回调（自动处理）

**端点:** `GET /api/auth/google/callback`

**说明:**
- 此端点由 Google OAuth 流程自动调用
- 不需要手动访问
- 成功后用户会被重定向到扩展页面并携带 token

---

### 8. GitHub 登录

**端点:** `GET /api/auth/github`

**说明:**
- 重定向到 GitHub 授权页面
- 用户授权后会回调到 `/api/auth/github/callback`
- 成功后重定向到 `${FRONTEND_URL}/auth/success?token=<jwt_token>`
- 失败时重定向到 `/api/auth/failure`

**使用示例:**
```html
<a href="http://localhost:3000/api/auth/github">使用 GitHub 登录</a>
```

---

### 9. GitHub 回调（自动处理）

**端点:** `GET /api/auth/github/callback`

**说明:**
- 此端点由 GitHub OAuth 流程自动调用
- 不需要手动访问

---

### 10. OAuth 认证失败

**端点:** `GET /api/auth/failure`

**响应:** `401 Unauthorized`
```json
{
  "error": "OAuth authentication failed"
}
```

**说明:**
- OAuth 认证失败时会重定向到此端点
- 常见失败原因：
  - 用户取消授权
  - 无法获取用户邮箱
  - 邮箱已被其他认证方式注册

---

## 数据同步 API

**注意:** 所有同步 API 都需要：
1. 在请求头中携带有效的 JWT token
2. 用户邮箱已验证（`emailVerified = true`）

### 11. 同步标注数据

**端点:** `POST /api/sync/highlights`

**请求头:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**请求体:**
```json
{
  "highlights": {
    "myz_123": {
      "id": "myz_123",
      "url": "https://example.com/page",
      "text": "选中的文本",
      "note": "我的批注",
      "tags": ["research"],
      "color": "#fde68a",
      "createdAt": "2025-10-24T08:00:00.000Z",
      "updatedAt": "2025-10-24T08:05:00.000Z"
    },
    "myz_456": {
      "id": "myz_456",
      "url": "https://example.com/another",
      "text": "另一个标注",
      "createdAt": "2025-10-24T09:00:00.000Z"
    }
  },
  "deletedIds": ["myz_789"]
}
```

**参数说明:**
- `highlights` (object, 必需): 客户端的所有标注数据，key 为标注 ID
- `deletedIds` (array, 可选): 客户端已删除的标注 ID 列表

**成功响应:** `200 OK`
```json
{
  "message": "Sync completed",
  "stats": {
    "uploaded": 2,
    "downloaded": 1,
    "deleted": 1,
    "total": 15
  },
  "downloadData": {
    "myz_999": {
      "id": "myz_999",
      "url": "https://example.com/new",
      "text": "服务器上的新标注",
      "createdAt": "2025-10-24T10:00:00.000Z"
    }
  },
  "deleteIds": ["myz_789"]
}
```

**响应说明:**
- `stats.uploaded`: 本次上传到服务器的标注数量
- `stats.downloaded`: 需要从服务器下载的标注数量
- `stats.deleted`: 本次删除的标注数量
- `stats.total`: 服务器上该用户的总标注数
- `downloadData`: 需要客户端合并的服务器数据
- `deleteIds`: 需要客户端删除的标注 ID

**同步逻辑:**

1. **冲突解决**: 使用"最后写入者胜出"策略
   - 比较 `updatedAt` 时间戳
   - 较新的版本会覆盖较旧的版本

2. **增量同步**:
   - 只上传客户端更新的数据
   - 只下载服务器上的新数据或更新
   - 避免传输未改变的数据

3. **删除同步**:
   - 客户端删除会同步到服务器
   - 服务器删除会通过 `deleteIds` 同步到客户端

**错误响应:**
- `401 Unauthorized`: 未认证或 token 无效
- `403 Forbidden`: 邮箱未验证
- `500 Internal Server Error`: 同步失败

---

### 12. 获取同步状态

**端点:** `GET /api/sync/status`

**请求头:**
```
Authorization: Bearer <your_jwt_token>
```

**成功响应:** `200 OK`

已同步：
```json
{
  "lastSyncAt": "2025-10-24T12:00:00.000Z",
  "highlightsCount": 42,
  "synced": true
}
```

未同步：
```json
{
  "lastSyncAt": null,
  "highlightsCount": 0,
  "synced": false
}
```

**参数说明:**
- `lastSyncAt`: 最后同步时间（ISO 8601 格式）
- `highlightsCount`: 服务器上该用户的标注总数
- `synced`: 是否已进行过同步

**错误响应:**
- `401 Unauthorized`: 未认证或 token 无效
- `403 Forbidden`: 邮箱未验证
- `500 Internal Server Error`: 获取状态失败

---

### 13. 获取所有标注

**端点:** `GET /api/sync/highlights`

**请求头:**
```
Authorization: Bearer <your_jwt_token>
```

**成功响应:** `200 OK`
```json
{
  "highlights": {
    "myz_123": {
      "id": "myz_123",
      "url": "https://example.com/page",
      "text": "选中的文本",
      "note": "我的批注",
      "tags": ["research"],
      "color": "#fde68a",
      "createdAt": "2025-10-24T08:00:00.000Z",
      "updatedAt": "2025-10-24T08:05:00.000Z"
    },
    "myz_456": {
      "id": "myz_456",
      "url": "https://example.com/another",
      "text": "另一个标注",
      "createdAt": "2025-10-24T09:00:00.000Z"
    }
  },
  "count": 2
}
```

**参数说明:**
- `highlights`: 用户在服务器上的所有标注数据
- `count`: 标注总数

**错误响应:**
- `401 Unauthorized`: 未认证或 token 无效
- `403 Forbidden`: 邮箱未验证
- `500 Internal Server Error`: 获取失败

**说明:**
- 此端点用于获取服务器上的完整数据
- 可用于首次同步或数据恢复
- 不建议频繁调用，推荐使用增量同步接口

---

## 错误响应

所有 API 端点在发生错误时都会返回统一格式的错误响应：

```json
{
  "error": "错误描述信息"
}
```

或者带详细信息的验证错误：

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

### 常见 HTTP 状态码

- `200 OK`: 请求成功
- `201 Created`: 资源创建成功
- `400 Bad Request`: 请求参数错误或验证失败
- `401 Unauthorized`: 未认证或认证失败
- `403 Forbidden`: 权限不足（如邮箱未验证）
- `404 Not Found`: 资源不存在
- `429 Too Many Requests`: 请求频率超限（15 分钟内最多 100 次）
- `500 Internal Server Error`: 服务器内部错误

---

## 使用示例

### 完整的认证和同步流程

#### 1. 注册用户

```javascript
const response = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123'
  })
});

const data = await response.json();
const token = data.token; // 保存 token
```

#### 2. 验证邮箱

用户点击邮件中的链接：
```
http://localhost:3000/api/auth/verify-email?token=<verification_token>
```

在扩展中处理验证结果：
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'email-verified') {
    // 更新用户状态
    console.log('Email verified successfully');
  }
});
```

#### 3. 同步数据

```javascript
const highlights = await chrome.storage.local.get('myz::highlights');

const response = await fetch('http://localhost:3000/api/sync/highlights', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    highlights: highlights['myz::highlights'].highlights,
    deletedIds: []
  })
});

const syncResult = await response.json();

// 合并服务器返回的数据
if (syncResult.downloadData) {
  const currentData = await chrome.storage.local.get('myz::highlights');
  const merged = {
    ...currentData['myz::highlights'],
    highlights: {
      ...currentData['myz::highlights'].highlights,
      ...syncResult.downloadData
    }
  };
  
  // 删除服务器标记的项
  syncResult.deleteIds?.forEach(id => {
    delete merged.highlights[id];
  });
  
  await chrome.storage.local.set({ 'myz::highlights': merged });
}
```

#### 4. OAuth 登录（在扩展中）

```javascript
// 在 popup 或 dashboard 中
document.getElementById('google-login').addEventListener('click', () => {
  chrome.tabs.create({
    url: 'http://localhost:3000/api/auth/google'
  });
});

// 监听认证成功的回调
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.includes('/auth/success?token=')) {
    const url = new URL(tab.url);
    const token = url.searchParams.get('token');
    
    // 保存 token
    chrome.storage.local.set({ 'myz::auth_token': token });
    
    // 关闭认证标签页
    chrome.tabs.remove(tabId);
  }
});
```

### 错误处理

```javascript
async function syncWithRetry(highlights, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/sync/highlights', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ highlights })
      });

      if (response.status === 403) {
        throw new Error('邮箱未验证，请先验证邮箱');
      }

      if (response.status === 401) {
        // Token 过期，需要重新登录
        throw new Error('登录已过期，请重新登录');
      }

      if (!response.ok) {
        throw new Error(`同步失败: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

---

## 安全建议

1. **HTTPS**: 生产环境必须使用 HTTPS
2. **Token 存储**: 在扩展中安全存储 JWT token
3. **Token 刷新**: 实现 token 刷新机制
4. **敏感操作**: 重要操作前验证用户身份
5. **数据加密**: 考虑对敏感数据进行加密
6. **CORS**: 生产环境配置精确的 CORS 策略
7. **速率限制**: 遵守 API 速率限制

---

## 版本历史

- **v1.0.0** (2025-10-24): 初始版本
  - 基本认证功能
  - OAuth 支持（Google, GitHub）
  - 增量数据同步
  - 邮箱验证

---

## 支持

如有问题或建议，请在 GitHub 仓库提交 Issue。
