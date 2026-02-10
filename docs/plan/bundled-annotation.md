# Bundled Annotation

MyZ Annotator 的核心功能之一是提供一个智能的注解系统，允许用户在网页上高亮文本并添加注释。这些注释不仅可以保存和管理，还能通过 AI 助理进行智能分析和总结，帮助用户更好地理解和利用网页内容。

Bundled Annotation 允许网站内容提供者在他们的网站上加入提供的高亮/注解，当安装了 MyZ Annotator 的用户访问这些网站时，可以直接看到这些注解。这种方式使得注解不仅仅是用户个人的工具，而是成为了网站内容的一部分，增强了用户的阅读体验。

作为用户，当访问到一个网站上包含 Bundled Annotation 的内容时，MyZ Annotator 会自动加载这些注解，并在用户界面上以高亮的形式展示出来。用户可以点击这些高亮部分查看详细的注释内容。这种方式使得用户能够更深入地理解网页内容。

作为网站提供者，可以在不影响网页主体结构之外添加新的注解内容，帮助用户更好地理解网页内容，并提供额外的价值。

Bundled Annotation 是一组静态的 JSON 文档，或者是由 HTML 页面的 link 标签指向的 JSON 文档。其中包含了注解的文本位置、注解内容以及相关的元数据。

默认，Bundled Annotation JSON 会被放置在 .well-known/myz.kimmy.fun/ 目录下。由 index.json 文件索引所有可用的注解文档，每个文档包含一个或多个注解条目。每个注解条目包含了注解的文本位置、内容以及相关的元数据。

如果是单独在某个页面上提供注解，也可以直接在该页面的 head 中通过 link 标签指向一个 JSON 文件，MyZ Annotator 会自动加载并展示这些注解。link的rel属性为 "myz-annotation"，href属性指向注解的 JSON 文件。

实现步骤：

- MyZ Annotator实现加载 .well-known 注解和 link 注解
- 定义注解的 JSON 结构，包括注解的文本位置、内容和元数据
- 提供 Skills 方便网站提供者生成符合规范的注解 JSON 文件
- 提供 Vitepress 等插件方便文档网站集成注解功能
