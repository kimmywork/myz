import { defineConfig, withBase } from 'vitepress'

export default defineConfig({
  title: 'MyZ Annotator',
  description: '高亮与批注的浏览器扩展 — 安装与使用指南',
  base: process.env.BASE ?? '/',
  lang: 'zh-CN',
  appearance: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '安装指南', link: '/install' },
      { text: '更新日志', link: '/changelog' },
      { text: '隐私政策', link: '/privacy' }
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '安装指南', link: '/install' },
          { text: '常见问题', link: '/faq' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/myz-suite' },
      { icon: 'twitter', link: 'https://x.com/kenpusney' }
    ],
    footer: {
      message: `<a href="${withBase('/privacy')}">隐私政策</a> · 本地优先，私有数据安全`,
      copyright: ''
    }
  }
})
