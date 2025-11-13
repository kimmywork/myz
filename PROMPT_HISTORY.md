---
agent: Kimi
model: kimi-for-coding
date: 2025-11-13
---

`myz-danmaku` 是一个 Youtube 的弹幕插件，用于 Google Chrome 等浏览器，我希望更新一下这个插件的UI，添加多语言支持。请提取出相关的文本材料，利用 Chrome 的 i18n API 来实现对中文和英文的支持。

---

还有一部份hardcoded文字没有更新（比如 popup 里的 setStatus），另外，请在popup中添加一个通过设置（⚙️ 按钮）打开的modal窗口，让用户可以选择语语言，选择语言后整体UI立即更新。

---

```
src/popup/main.ts:329:21 - error TS2339: Property 'focus' does not exist on type 'Element'.

329   modalCloseButton?.focus();
                        ~~~~~


Found 1 error in src/popup/main.ts:329
```

---

这种方式还需要Google的i18n API吗？如果不需要了能否把content里的部分也动态化吗？

---

我看你加入了 // Removed: default_locale - we're handling i18n ourselves 在Manifest里，那怎么告诉Chrome Web Store我们支持多语言呢？

---

"npm run build 以后构建的内容里好像并没有包含 _locales 文件，我把 _locales 放到 my-danmaku 跟目录才行。下次注意。

---

popup开启的窗口太小了，根本展示不全设置的Modal。请更新下popup窗口的配置

---

你为什么改了我的content.ts的逻辑草泥马

---

但是你为什么又把我本来有的改动给删了。而且多语言的改动怎么也给删了。

---

不是要配合popup的改动实现动态的多语言吗？怎么又是纯粹chrome i18n的实现？

---

我测试了一下，content script里的内容并不会随着popup中的语言设置变化而变化。而且在我浏览器默认为英文的情况下依然以中文文本显示。检查了myz-danmaku-language的storage值为en

---

我们在修改 `myz-danmaku` 的时候创建了很多备份文件，请检查这些备份文件是否还有存在的必要，另外 _locales 的部分是否可以与 src/shared/i18n.ts 里的内容合并。

---

好像还有个 main-backup-full.ts。另外，_locales/ 和 i18n.ts 都需要保持。_locales 是告诉 Chrome Web Store 我们支持多语言，而 i18n.ts 支持了动态切换语言的功能。

---

popup页面好像有点问题：

```
Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users. Avoid using aria-hidden on a focused element or its ancestor. Consider using th
e inert attribute instead, which will also prevent focus. For more details, see the aria-hidden section of the WAI-ARIA specification at https://w3c.github.io/aria/#aria-hidden. Element with focus: <button.modal__b
utton modal__button--secondary> Ancestor with aria-hidden: <div.modal#languageModal>
```

---

