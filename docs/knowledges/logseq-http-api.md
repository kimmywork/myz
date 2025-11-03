# **LogSeq HTTP API 完整指南：写入、查询与验证**

LogSeq 提供了一个本地 HTTP API 服务器，允许第三方应用（如脚本、剪藏工具、自动化服务）与 LogSeq 客户端进行交互。其核心机制是调用 LogSeq 内部的[插件 API](https://plugins-doc.logseq.com/) 方法。

本文档将详细介绍如何启用 API、写入内容（创建页面和块），以及如何查询和验证这些操作的结果。

## **一、 启用 API 服务器**

在使用 API 之前，你必须在 LogSeq 桌面客户端中手动开启它。

1. 打开 LogSeq。  
2. 进入 设置 (Settings)。  
3. 进入 高级 (Advanced) 选项卡。  
4. 找到 "开发者模式" (Developer mode)，将其开启。  
5. 开启后，下方会出现 "API 服务器" (API server) 选项，将其开启。  
6. (可选) 你可以修改默认的 IP 和端口（默认为 127.0.0.1:12315）。  
7. 点击 "API 服务器 tokens" 旁边的 "管理" (Manage)。  
8. 生成一个新的 Token，并**立即复制并保存**这个 Token。**这是你的 API 密钥，请妥善保管。**

## **二、 API 基础**

所有 API 请求都遵循统一的格式：

* **Endpoint:** http://127.0.0.1:12315/api (或你自定义的地址)  
* **Method:** POST  
* **Headers:**  
  * `Content-Type: application/json`
  * `Authorization: Bearer <你的Token>`
* **Body (JSON):**  
```
  {  
    "method": "API方法名",  
    "args": [ "参数1", "参数2", ... ]  
  }
```

* **响应 (Response):**  
  * **成功:** API 方法的返回值（例如 BlockEntity 对象或 boolean 值）。  
  * **失败:** 返回一个包含 error 字段的 JSON 对象。

## **三、 核心 API：写入内容 (页面与块)**

这些是向 LogSeq 添加内容的核心方法。

### **1. 批量插入块 (`logseq.Editor.insertBatchBlock`)**

**这是同步 Markdown 片段的【最推荐】方法。** 它可以将一个包含多行或多层级的 Markdown 块对象数组，一次性写入并保留正确的层级关系。

⚠️ **注意**：`insertBatchBlock` 的第一个参数必须是**父块的 UUID**，而不是页面名称。要向页面写入内容，需要先获取该页面的根块 UUID。

典型流程如下：

1. 调用 `logseq.Editor.getPage` 获取页面。如果结果为 `null`，说明页面不存在。  
2. 调用 `logseq.Editor.createPage` 创建页面（可加上 `options.createFirstBlock = true` 让页面生成一个空块）。  
3. 从返回的 `PageEntity` 中读取 `uuid`，这就是页面根块的 UUID。  
4. 调用 `logseq.Editor.insertBatchBlock(uuid, contentArray, options)` 向该页面追加内容。

* **用途:** 在指定父块下插入一个或多个子块。对于页面来说，父块就是页面的根块（其 `uuid` 可通过上面的流程取得）。  
* **参数 (args):**  
  1. `parentBlockUuid` (string): 目标父块的 UUID。  
  2. `contentArray` (array of block objects): **每个元素必须是一个对象**，至少包含 `content` 字段，可选 `children`（同样是 block 对象数组）和 `properties`。LogSeq 会根据这些对象生成层级结构。  
  3. `options` (object):  
     * `sibling`: false（默认）表示作为父块的子块插入。传 `true` 时将作为“同级块”插入。  
     * `before`: false（默认）表示插入在末尾；传 `true` 时插入到开头。  
* **返回值:** `BlockEntity[] | null` - 一个包含所有被创建块的对象数组。**这是验证写入成功的关键**，每个对象都包含 uuid。

**示例：确保页面存在并追加一组块**

先读取页面：

```json
{
  "method": "logseq.Editor.getPage",
  "args": ["Inbox"]
}
```

如果结果为 `null`，再创建页面并生成根块：

```json
{
  "method": "logseq.Editor.createPage",
  "args": [
    "Inbox",
    null,
    { "createFirstBlock": true, "redirect": false }
  ]
}
```

获取到页面的 `uuid` 后，再批量插入块：

```json
{
  "method": "logseq.Editor.insertBatchBlock",
  "args": [
    "6715f8a0-8a6a-4b0c-80f2-11a3b123abcd",
    [
      {
        "content": "剪藏收集箱",
        "children": [
          { "content": "页面：[LogSeq 官网](https://logseq.com/)" },
          { "content": "ID:: clip-12345" },
          { "content": "标签:: #clipping" },
          {
            "content": "摘录",
            "children": [
              { "content": "LogSeq 是一个本地优先、隐私友好的知识库。" }
            ]
          }
        ]
      }
    ],
    {
      "sibling": false,
      "before": false
    }
  ]
}
```

### **2. 追加单个块 (`logseq.Editor.appendBlockInPage`)**

如果你的 Markdown 片段只是一个单独的字符串（可以是多行），可以使用这个更简单的方法。

* **用途:** 在指定页面的末尾追加一个新块。  
* **参数 (args):**  
  1. `pageName` (string): 目标页面的名称。  
  2. `content` (string): 块的内容。使用 `\n` 来表示 Markdown 中的换行。  
* **返回值:** `BlockEntity | null` - 被创建的那个块的对象，包含 uuid。

**示例：将一个多行 Markdown 笔记附加到当日日记**

*（假设今天是 2025-10-24）*

```json
{
  "method": "logseq.Editor.appendBlockInPage",
  "args": [
    "2025-10-24",
    "刚收集到一条笔记：\n- 这是第一行。\n- 这是第二行，包含 **加粗**。"
  ]
}
```

### **3. 创建新页面 (`logseq.Editor.createPage`)**

* **用途:** 创建一个新页面，可以附带页面属性 (Properties)。  
* **参数 (args):**  
  1. `pageName` (string): 新页面的名称。  
  2. `properties` (object, 可选): 要添加到页面顶部的属性（例如 tags）。  
  3. `options` (object, 可选):  
     * `createFirstBlock`: true (可选): 是否自动创建一个空块。  
     * `redirect`: false (可选): 是否在 LogSeq 客户端中跳转到这个新页面。  
* **返回值:** `PageEntity | null` - 被创建的页面的对象。

**提示：** 单独创建页面后，你仍需使用 `insertBatchBlock` 或 `appendBlockInPage` 来向其中添加内容。由于 `insertBatchBlock` 需要一个已存在的父块 UUID，因此强烈建议先调用 `getPage`/`createPage` 来确保页面存在并获取正确的 UUID。

## **四、 核心 API：查询与验证结果**

写入操作后，你需要验证内容是否已成功存入。

### **方法一：通过返回的 UUID 验证 (`logseq.Editor.getBlock`)**

`insertBatchBlock` 和 `appendBlockInPage` 成功后会返回新块的 `BlockEntity` 对象，其中包含 uuid。你可以立即使用这个 uuid 来取回该块，这是最精确的验证方法。

* **用途:** 获取指定 uuid 的块的详细信息。  
* **参数 (args):**  
  1. `blockUuid` (string): 块的 uuid。  
* **返回值:** `BlockEntity | null` - 块的对象。

**示例：验证刚刚创建的块**

假设 `insertBatchBlock` 返回的 uuid 是 "6715f8a0-8a6a-4b0c-80f2-11a3b123abcde"：

```
{  
  "method": "logseq.Editor.getBlock",  
  "args": [  
    "6715f8a0-8a6a-4b0c-80f2-11a3b123abcde"  
  ]  
}
```

**成功的响应会是：**

```
{  
  "id": 612,  
  "uuid": "6715f8a0-8a6a-4b0c-80f2-11a3b123abcde",  
  "content": "一个新收集的片段",  
  "page": { "name": "inbox", "id": 8 },  
  "children": [  
    // ... 子块的对象  
  ]  
  // ... 其他属性  
}
```

如果能取回内容，说明写入已100%成功。

### **方法二：执行 Datalog 查询 (`logseq.DB.q`)**

这是用户最关心的**查询功能**。它允许你使用 `Datalog` 语句在整个知识库中搜索。这是最灵活的验证方式，你可以在不知道 uuid 的情况下，仅通过内容来查找。

* **用途:** 执行 Datalog 查询。  
* **参数 (args):**  
  1. `query` (string): Datalog 查询语句。  
* **返回值:** `any[]` - 查询结果数组。

**示例：查询包含特定文本的块**

假设我们想验证 "一个新收集的片段" 这个块是否被写入：

```
{  
  "method": "logseq.DB.q",  
  "args": [  
    "[:find (pull ?b [*]) :where [?b :block/content \"一个新收集的片段\"]]"  
  ]  
}
```

* **查询语句解释:**  
  * `:find (pull ?b [*])`: 查找匹配的实体（我们称之为 `?b`），并拉取 (`pull`) 它的所有 (`*`) 属性。  
  * `:where [?b :block/content "一个新收集的片段"]`: 匹配条件是：实体 `?b` 的 `:block/content` 属性 *完全等于* "一个新收集的片段"。  
* **返回值:** 将返回一个数组，其中包含所有匹配该内容的块对象（`BlockEntity`）。如果数组不为空，说明写入成功。

**示例：更模糊的内容查询**

如果你只想查询 *包含* 某个词的块，Datalog 查询会更复杂。一个简单的方法是使用 logseq.DB.datascriptQuery：

```
{  
  "method": "logseq.DB.datascriptQuery",  
  "args": [  
    "[:find (pull ?b [*]) :where [(fulltext $ :block/content \"收集的片段\") [[?b]]]]"  
  ]  
}
```

### **方法三：获取页面所有内容 (`logseq.Editor.getPageBlocksTree`)**

如果你总是向固定的页面（如 "Inbox"）同步，可以获取该页面的所有块树来进行验证。

* **用途:** 获取一个页面及其所有子块，形成一个树状结构。  
* **参数 (args):**  
  1. `pageName` (string): 目标页面的名称。  
* **返回值:** `BlockEntity[]` - 页面上所有顶级块的数组（每个块都可能包含 children 属性）。

**示例：获取 "Inbox" 页面的所有内容**

```
{  
  "method": "logseq.Editor.getPageBlocksTree",  
  "args": [  
    "Inbox"  
  ]  
}
```

你可以在你的程序中遍历返回的数组，检查是否包含你刚刚插入的内容。

## **五、 完整 cURL 命令行示例**

这是一个从写入到验证的完整流程，你可以在 cURL (Linux/macOS/Git Bash) 中测试。

**请将 `<你的Token>` 替换为你的真实 API Token。**

### **1. 获取（或创建）目标页面**

先查询页面是否存在：

```
curl http://127.0.0.1:12315/api \
-X POST \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <你的Token>" \
-d '{
  "method": "logseq.Editor.getPage",
  "args": ["Inbox"]
}'
```

如果响应为 `null`，需要显式创建页面，并让 LogSeq 生成根块：

```
curl http://127.0.0.1:12315/api \
-X POST \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <你的Token>" \
-d '{
  "method": "logseq.Editor.createPage",
  "args": [
    "Inbox",
    null,
    { "createFirstBlock": true, "redirect": false }
  ]
}'
```

两种情况下都会得到一个 `PageEntity` 对象。记下其中的 `uuid`，它就是页面根块的 UUID。

### **2. 写入内容**

拿到根块 UUID（例如 `6715f8a0-8a6a-4b0c-80f2-11a3b123abcd`）后，再批量写入：

```
curl http://127.0.0.1:12315/api \
-X POST \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <你的Token>" \
-d '{
  "method": "logseq.Editor.insertBatchBlock",
  "args": [
    "6715f8a0-8a6a-4b0c-80f2-11a3b123abcd",
    [
      {
        "content": "我的验证测试片段",
        "children": [
          { "content": "ID:: clip-12345" }
        ]
      }
    ],
    {
      "sibling": false,
      "before": false
    }
  ]
}'
```

### **3. 查看写入响应**

上述命令会返回一个 JSON 数组，包含新创建的块。记下第一个块的 uuid。

**可能的响应：**

```
[  
  {  
    "content": "我的验证测试片段",  
    "uuid": "6715f9d4-c48c-4a37-9af3-4c9f1a23b45d",  
    "id": 1024,  
    "children": [  
      {  
        "content": "ID: clip-12345",  
        "uuid": "6715f9d4-1a3b-4c1e-8f2c-5b8d9c0e1f2g",  
        "id": 1025  
        // ...  
      }  
    ]  
    // ...  
  }  
]
```

我们得到了新建块的 uuid："6715f9d4-c48c-4a37-9af3-4c9f1a23b45d"

### **4. (验证方法一) 通过 UUID 获取块**

```
curl http://127.0.0.1:12315/api \
-X POST \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <你的Token>" \
-d '{  
  "method": "logseq.Editor.getBlock",  
  "args": [  
    "6715f9d4-c48c-4a37-9af3-4c9f1a23b45d"  
  ]  
}'
```

如果这能返回块的 JSON，说明写入已确认。

### **5. (验证方法二) 通过 Datalog 查询**

我们也可以通过内容来查询，以验证其是否存在于数据库中。

```
curl http://127.0.0.1:12315/api \
-X POST \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <你的Token>" \
-d '{  
  "method": "logseq.DB.q",  
  "args": [  
    "[:find (pull ?b [*]) :where [?b :block/content \"我的验证测试片段\"]]"  
  ]  
}'
```

如果返回的 JSON 数组不是 `[]`（空数组），则说明验证成功。
