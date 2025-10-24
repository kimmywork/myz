# MyZ Service 快速设置指南

本指南帮助你快速启动 MyZ Annotator 后端服务。

## 前置要求

- Node.js 18 或更高版本
- PostgreSQL 14 或更高版本
- 邮箱账户（用于发送验证邮件）

## 快速开始（开发环境）

### 1. 安装依赖

```bash
cd service
npm install
```

### 2. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少配置以下必需项：

```env
# 数据库配置（必需）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myz_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT 密钥（必需，生产环境请使用强随机字符串）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# SMTP 配置（用于邮箱验证）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@myz-annotator.com

# 扩展 URL（用于邮件验证链接）
FRONTEND_URL=chrome-extension://your-extension-id
```

### 3. 创建数据库

```bash
# 使用 psql 或其他工具创建数据库
createdb myz_db

# 或使用 psql
psql -U postgres -c "CREATE DATABASE myz_db;"
```

### 4. 运行数据库迁移

```bash
npm run build
npm run migrate
```

如果看到 "Database migration completed successfully!"，说明数据库设置成功。

### 5. 启动开发服务器

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动。

### 6. 测试服务

在浏览器或使用 curl 访问：

```bash
curl http://localhost:3000/health
```

应该返回：

```json
{
  "status": "ok",
  "timestamp": "2025-10-24T12:00:00.000Z"
}
```

## Gmail SMTP 设置

如果使用 Gmail 发送验证邮件：

1. 登录 Google 账户
2. 启用两步验证
3. 生成应用专用密码：
   - 访问 https://myaccount.google.com/apppasswords
   - 选择"邮件"和"其他（自定义名称）"
   - 输入"MyZ Service"
   - 复制生成的 16 位密码
4. 在 `.env` 中使用这个密码作为 `SMTP_PASSWORD`

## OAuth 配置（可选）

### Google OAuth

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Google+ API
4. 创建 OAuth 2.0 凭据：
   - 应用类型：Web 应用
   - 已授权的重定向 URI：`http://localhost:3000/api/auth/google/callback`
5. 复制 Client ID 和 Client Secret 到 `.env`：
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
   ```

### GitHub OAuth

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 "New OAuth App"
3. 填写信息：
   - Application name: MyZ Annotator
   - Homepage URL: http://localhost:3000
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
4. 复制 Client ID 和 Client Secret 到 `.env`：
   ```env
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
   ```

## Docker 快速启动（推荐用于测试）

如果你安装了 Docker 和 Docker Compose：

```bash
# 启动服务和数据库
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

注意：使用 Docker Compose 时，数据库会自动创建和配置。

## 测试 API

### 1. 注册用户

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. 获取验证链接

检查服务日志，会显示验证 token（开发环境）。或者查看邮箱中的验证邮件。

### 3. 验证邮箱

```bash
curl "http://localhost:3000/api/auth/verify-email?token=<your-token>"
```

### 4. 登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

保存返回的 `token`。

### 5. 同步数据

```bash
curl -X POST http://localhost:3000/api/sync/highlights \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "highlights": {
      "test_1": {
        "id": "test_1",
        "text": "Test highlight",
        "createdAt": "2025-10-24T12:00:00.000Z"
      }
    }
  }'
```

## 常见问题

### 数据库连接失败

- 确认 PostgreSQL 正在运行
- 检查 `.env` 中的数据库配置
- 确认数据库用户有权限

### 邮件发送失败

- 检查 SMTP 配置
- 确认 Gmail 应用密码正确
- 检查防火墙是否阻止 SMTP 端口 587

### OAuth 回调失败

- 确认回调 URL 与 OAuth 应用配置完全匹配
- 检查 Client ID 和 Secret 是否正确

### Token 验证失败

- 确认 JWT_SECRET 配置正确
- 检查 token 是否过期
- 确认请求头格式：`Authorization: Bearer <token>`

## 生产部署建议

1. **使用 HTTPS**：必须使用 SSL/TLS 加密
2. **强密码**：使用强随机 JWT_SECRET
3. **环境隔离**：不要在代码中硬编码密钥
4. **数据备份**：定期备份 PostgreSQL 数据库
5. **日志监控**：设置日志聚合和监控
6. **速率限制**：根据实际需求调整
7. **CORS 配置**：只允许你的扩展域名
8. **数据库连接池**：根据负载调整连接池大小

## 下一步

- 阅读完整的 [API 文档](../knowledges/service-api.md)
- 在扩展中集成认证和同步功能
- 配置生产环境
- 设置监控和日志

## 获取帮助

如有问题，请在 GitHub 仓库提交 Issue。
