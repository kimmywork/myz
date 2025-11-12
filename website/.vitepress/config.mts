import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'MyZ Suite',
  description: '高亮与批注的浏览器扩展 — 安装与使用指南',
  base: process.env.BASE ?? '/',
  lang: 'zh-CN',
  appearance: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: './favicon.png' }],
  ],
  themeConfig: {
    nav: [
      { text: 'MyZ Annotator', link: '/' },
      { text: 'MyZ Danmaku', link: '/myz-danmaku' },
      { text: '隐私政策', link: '/privacy' },
      { text: '用户协议', link: '/tos' },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: 'MyZ Annotator 安装指南', link: '/install' },
          { text: '常见问题', link: '/faq' },
          { text: '更新日志', link: '/changelog' },
          { text: '隐私政策', link: '/privacy' },
          { text: '用户协议', link: '/tos' },
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/myz-suite' },
      { icon: 'twitter', link: 'https://x.com/kenpusney' }
    ],
    footer: {
      message: `<a href="/privacy">隐私政策</a> · 本地优先，私有数据安全`,
      copyright: ''
    }
  }
})
