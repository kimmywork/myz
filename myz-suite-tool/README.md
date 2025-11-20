# MyZ Suite Tool

基于 Tauri 2 和 Vue 3 + TypeScript 构建的 GUI 工具套件，用于管理和监控 MyZ 生态系统中的各项服务。

## 项目架构

### 技术栈
- **前端框架**: Vue 3 + Composition API + JSX
- **路由管理**: Vue Router 4 (嵌套路由架构)
- **样式框架**: TailwindCSS
- **桌面应用**: Tauri 2
- **开发语言**: TypeScript

### 目录结构
```
src/
├── components/
│   └── Layout.tsx          # 主布局组件 (顶部导航 + 侧边栏)
├── views/
│   ├── Home.tsx            # 首页容器
│   ├── home/               # 首页子页面
│   │   ├── HomeOverview.tsx
│   │   ├── HomeTools.tsx
│   │   └── HomeActivity.tsx
│   ├── Monitor.tsx         # 监控页面容器
│   ├── monitor/            # 监控子页面
│   │   ├── MonitorMCP.tsx
│   │   ├── MonitorModels.tsx
│   │   ├── MonitorAgents.tsx
│   │   └── MonitorUnimplemented.tsx
│   ├── Settings.tsx        # 设置页面容器
│   └── settings/           # 设置子页面
│       ├── GeneralSettings.tsx
│       ├── EnvironmentSettings.tsx
│       ├── NetworkSettings.tsx
│       ├── MCPSettings.tsx
│       ├── ModelSettings.tsx
│       └── AgentSettings.tsx
├── router/
│   └── index.ts           # 路由配置 (嵌套路由)
└── main.tsx              # 应用入口
```

## 核心特性

### 1. 智能侧边栏导航
- **自动内容生成**: 根据当前路由自动生成对应的侧边栏导航项
- **动态高亮**: 自动高亮当前激活的导航项
- **固定定位**: 侧边栏完全固定，不随页面内容滚动
- **响应式折叠**: 可折叠/展开的侧边栏，节省屏幕空间

### 2. 嵌套路由架构
采用 Vue Router 的嵌套路由设计，实现清晰的路由层次：

```typescript
// 主要路由结构
/
├── / (首页)
│   ├── / (概览)
│   ├── /tools (快捷工具)
│   └── /activity (最近活动)
├── /monitor (监控)
│   ├── /monitor (MCP 监控)
│   ├── /monitor/models (模型监控)
│   ├── /monitor/agents (智能体监控)
│   ├── /monitor/network (网络监控)
│   └── /monitor/system (系统监控)
└── /settings (设置)
    ├── /settings (基础设置)
    ├── /settings/environment (环境管理)
    ├── /settings/network (网络设置)
    ├── /settings/mcp (MCP 管理)
    ├── /settings/models (模型接口)
    └── /settings/agents (智能体管理)
```

### 3. 组件职责分离
- **Layout 组件**: 统一管理顶部导航栏和侧边栏
- **页面容器**: 只负责页面标题和嵌套路由渲染
- **子页面组件**: 专注于具体业务逻辑和 UI 展示

## 开发指南

### 环境要求
- Node.js 18+
- Rust (Tauri 2 要求)
- 包管理器: npm 或 yarn

### 开发命令
```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建应用
npm run build

# 预览构建结果
npm run preview
```

### 添加新页面
1. 在对应目录下创建新的页面组件
2. 在 `router/index.ts` 中添加路由配置
3. 在 `Layout.tsx` 的 `sidebarContent` 计算属性中添加对应的导航项

### 样式规范
- 使用 TailwindCSS 类名进行样式定义
- 遵循 TailwindCSS 的响应式设计原则
- 保持组件样式的一致性和可维护性

## 设计原则

### 1. 单一职责
每个组件只负责特定的功能，避免功能耦合。

### 2. 路由驱动
所有导航状态由 Vue Router 管理，避免手动状态同步。

### 3. 响应式设计
利用 Vue 3 的响应式系统，实现数据驱动的 UI 更新。

### 4. 用户体验
- 固定侧边栏提供稳定的导航体验
- 自动高亮当前页面提供清晰的定位
- 响应式布局适应不同屏幕尺寸

## 页面功能

### 首页 (/)
- **系统概览**: 整体系统状态和关键指标
- **快捷工具**: 常用工具和快速操作
- **最近活动**: 系统操作记录和时间线

### 监控页面 (/monitor)
- **MCP 监控**: MCP 服务状态和性能指标
- **模型监控**: AI 模型连接状态和使用情况
- **智能体监控**: 智能体运行状态和任务统计
- **网络监控**: 网络连接和带宽使用情况
- **系统监控**: 系统资源和硬件状态

### 设置页面 (/settings)
- **基础设置**: 系统基本配置和偏好设置
- **环境管理**: 开发环境和运行环境配置
- **网络设置**: 网络代理和连接配置
- **MCP 管理**: MCP 服务配置和管理
- **模型接口**: AI 模型 API 配置
- **智能体管理**: 智能体配置和部署

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。