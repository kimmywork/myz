import { defineConfig } from 'vitepress'

export default defineConfig({
  base: process.env.BASE ?? '/',
  appearance: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: './favicon.png' }],
    ['link', { rel: 'me', href: 'https://mastodon.social/@kenpusney'}],
  ],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'MyZ Suite',
      description: 'MyZ AI 高亮智能助理与弹幕助手浏览器扩展 — 安装与使用指南',
      themeConfig: {
        nav: [
          { text: 'MyZ 高亮智能助理', link: '/' },
          { text: 'MyZ 弹幕助手', link: '/myz-danmaku' },
          { text: '隐私政策', link: '/privacy' },
          { text: '用户协议', link: '/tos' }
        ],
        sidebar: {
          '/annotator/': [
            {
            text: 'MyZ 高亮智能助理',
            items: [
              { text: '安装指南', link: '/annotator/install' },
              { text: '用户指南', link: '/annotator/user-guide' },
              { text: '常见问题', link: '/annotator/faq' },
              { text: '更新日志', link: '/annotator/changelog' },
              { text: '隐私政策', link: '/privacy' },
              { text: '用户协议', link: '/tos' }
            ]
          }
          ],
          "/danmaku/": [
            {
            text: 'MyZ 弹幕助手',
            items: [
              { text: '指南', link: '/danmaku/guide' },
              { text: '隐私政策', link: '/privacy' },
              { text: '用户协议', link: '/tos' }
            ]
          }
          ]
        },
        socialLinks: [
          { icon: 'github', link: 'https://github.com/myz-suite' },
          { icon: 'twitter', link: 'https://x.com/kenpusney' }
        ],
        footer: {
          message: `<a href="/privacy">隐私政策</a> · 本地优先，私有数据安全`,
          copyright: ''
        }
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: 'MyZ Suite',
      description: 'Home for MyZ AI Annotator & MyZ Danmaku Viewer browser extensions',
      themeConfig: {
        nav: [
          { text: 'MyZ AI Annotator', link: '/en/' },
          { text: 'MyZ Danmaku Viewer', link: '/en/myz-danmaku' },
          { text: 'Privacy Policy', link: '/en/privacy' },
          { text: 'Terms of Service', link: '/en/tos' }
        ],
        sidebar: {
          '/en/annotator/': [
            {
            text: 'MyZ AI Annotator',
            items: [
              { text: 'Installation', link: '/en/annotator/install' },
              { text: 'User Guide', link: '/en/annotator/user-guide' },
              { text: 'FAQ', link: '/en/annotator/faq' },
              { text: 'Changelog', link: '/en/annotator/changelog' },
              { text: 'Privacy Policy', link: '/en/privacy' },
              { text: 'Terms of Service', link: '/en/tos' }
            ]
          }
          ],
          "/en/danmaku/": [
            {
            text: 'MyZ Danmaku Viewer',
            items: [
              { text: 'Guide', link: '/en/danmaku/guide' },
              { text: 'Privacy Policy', link: '/en/privacy' },
              { text: 'Terms of Service', link: '/en/tos' }
            ]
          }
          ]
        },
        socialLinks: [
          { icon: 'github', link: 'https://github.com/myz-suite' },
          { icon: 'twitter', link: 'https://x.com/kenpusney' }
        ],
        footer: {
          message: `<a href="/en/privacy">Privacy Policy</a> · Local-first, secure personal data`,
          copyright: ''
        }
      }
    }
  }
})
