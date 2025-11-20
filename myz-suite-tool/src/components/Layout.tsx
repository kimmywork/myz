import { defineComponent, ref, computed } from "vue";
import { RouterView, useRoute, RouterLink } from "vue-router";

export default defineComponent({
  name: "Layout",
  setup() {
    const isSidebarOpen = ref(true);
    const route = useRoute();

    const toggleSidebar = () => {
      isSidebarOpen.value = !isSidebarOpen.value;
    };

    // 根据当前路由自动生成侧边栏内容
    const sidebarContent = computed(() => {
      let tabs: {id: string, name: string, icon: string, path: string}[] = [];

      // 设置页面的侧边栏
      if (route.path.startsWith("/settings")) {
        tabs = [
          { id: "general", name: "基础设置", icon: "⚙️", path: "/settings" },
          { id: "environment", name: "环境管理", icon: "🔧", path: "/settings/environment" },
          { id: "network", name: "网络设置", icon: "🌐", path: "/settings/network" },
          { id: "mcp", name: "MCP 管理", icon: "🛠️", path: "/settings/mcp" },
          { id: "models", name: "模型接口", icon: "🤖", path: "/settings/models" },
          { id: "agents", name: "智能体管理", icon: "👥", path: "/settings/agents" },
        ];
      } else if (route.path.startsWith("/monitor")) {
        tabs = [
          { id: "mcp", name: "MCP 监控", icon: "🔧", path: "/monitor" },
          { id: "models", name: "模型监控", icon: "🤖", path: "/monitor/models" },
          { id: "agents", name: "智能体监控", icon: "👥", path: "/monitor/agents" },
          { id: "network", name: "网络监控", icon: "🌐", path: "/monitor/network" },
          { id: "system", name: "系统监控", icon: "💻", path: "/monitor/system" },
        ];
      } else if (["/", "/tools", "/activity"].includes(route.path)) {
        tabs = [
          { id: "overview", name: "系统概览", icon: "📊", path: "/" },
          { id: "tools", name: "快捷工具", icon: "⚡", path: "/tools" },
          { id: "activity", name: "最近活动", icon: "🕒", path: "/activity" },
        ]
      }

      return (
          <div class="space-y-1">
            {tabs.map((tab) => (
              <RouterLink
                key={tab.id}
                to={tab.path}
                class={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  route.path === tab.path
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span class="mr-3">{tab.icon}</span>
                <span class="truncate">{tab.name}</span>
              </RouterLink>
            ))}
          </div>
        );
    });

    return () => (
      <div class="min-h-screen bg-gray-50 flex flex-col">
        {/* Top Navigation Bar - 固定 */}
        <nav class="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
              <div class="flex items-center">
                <div class="shrink-0 flex items-center">
                  <h1 class="text-xl font-bold text-gray-900">
                    MyZ Suite Tool
                  </h1>
                </div>
                <div class="hidden md:ml-6 md:flex md:space-x-8">
                  <RouterLink
                    to="/"
                    class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    active-class="border-blue-500 text-gray-900"
                  >
                    首页
                  </RouterLink>
                  <RouterLink
                    to="/monitor"
                    class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    active-class="border-blue-500 text-gray-900"
                  >
                    监控
                  </RouterLink>
                  <RouterLink
                    to="/settings"
                    class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    active-class="border-blue-500 text-gray-900"
                  >
                    设置
                  </RouterLink>
                </div>
              </div>
              <div class="flex items-center">
                {/* 这里可以放置其他顶部栏按钮，如用户菜单等 */}
              </div>
            </div>
          </div>
        </nav>

        {/* 侧边栏打开按钮 - 悬浮设计 */}
        {!isSidebarOpen.value && (
          <button
            onClick={toggleSidebar}
            class="fixed top-20 left-4 p-2 rounded-full bg-white shadow-md border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 hover:shadow-lg transition-all duration-200 z-20"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        {/* Main Content - 可滚动区域 */}
        <div class="flex flex-1 overflow-hidden">
          {/* Sidebar - 固定定位 */}
          {isSidebarOpen.value && sidebarContent.value && (
            <aside class="w-64 bg-white shadow-sm border-r border-gray-200 fixed top-16 left-0 bottom-0">
              <div class="h-full flex flex-col">
                {/* 侧边栏头部，包含关闭按钮 */}
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                  <h2 class="text-sm font-medium text-gray-500">导航</h2>
                  <button
                    onClick={toggleSidebar}
                    class="p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                  >
                    <svg
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                {/* 侧边栏导航内容 - 固定高度，不滚动 */}
                <div class="flex-1">
                  <div class="p-4">
                    <nav class="space-y-1">{sidebarContent.value}</nav>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Page Content - 可滚动 */}
          <main class={`flex-1 overflow-y-auto ${isSidebarOpen.value ? "ml-64" : "ml-12"}`}>
            <div class="py-6">
              <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <RouterView />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  },
});