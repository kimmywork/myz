---
agent: Copilot
model: GPT-5-Codex
date: 2025-11-11
---

MyZ 是一系列的上网浏览辅助工具。 我希望创建一个用于在 Youtube 平台浏览和发布弹幕的 Chrome 插件，这个工具会读取 Youtube 视频的评论列表，然后把带有时间码的评论作为弹幕呈现在视频播放的对应时间点上。

1. 用户必须登录Youtube以后才能使用这个工具
2. 在Youtube播放器上增加一个新的按钮让用户可以发布新的弹幕。发布弹幕即在视频评论区添加一个评论，并且在评论内容前面加上当前播放时间的时间码。
3. 在Action button附近显示一个badge，即当前视频的弹幕数量。同时点击打开的popup页面展示的是按照时间码排序的弹幕（评论）列表，也即即将展示在播放器里的内容。

弹幕插件的代码请放在 danmaku 文件夹下面。

---

我看到弹幕数量成功更新了，但是播放器里在对应的时间点没有显示弹幕。Popup页面也提示 Unable to load danmaku data.

另外，弹幕数量更新需要我手动去加载（即滚动页面加载更多评论）才行。请换成后台自动拉取全部评论的方式，减少用户的操作。

---

OK，Popup的列表显示正常了，但是仍然没有自动拉取评论数据，请检查是否正常初始化了拉取流程以及是否正常获取到了评论。
另外，播放器里的弹幕仍然没有显示。

---

没有按到任何的日志，也没看到content script有抛出任何异常

---

index.js:2 MyZ Danmaku: content script loaded
index.js:32 MyZ Danmaku: init navigation handlers
index.js:54 MyZ Danmaku: handleNavigation {videoId: 'hOi8s2wkX4A', currentVideoId: null}
index.js:73 MyZ Danmaku: detected new video {videoId: 'hOi8s2wkX4A'}
index.js:54 MyZ Danmaku: handleNavigation {videoId: 'hOi8s2wkX4A', currentVideoId: 'hOi8s2wkX4A'}
rs=AGKMywFhqXkC3Vy1D…d5yn4Dt69icmbA:3435 MyZ Danmaku: innertube credentials missing, scheduling retry

---

Executing inline script violates the following Content Security Policy directive 'script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' http://localhost:* http://127.0.0.1:* chrome-extension://66765101-8afb-4a75-b2f1-a8989d865537/'. Either the 'unsafe-inline' keyword, a hash ('sha256-EDx6Dz/pkgQn0Un/g3IZOioFc7xiuTCTT9Fuotpbf9U='), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.

---

MyZ Danmaku: initial batch empty, requesting fallback data
loadDanmakuFromApi @ index.js:635
POST https://www.youtube.com/youtubei/v1/get_comments?key=\<REDACTED> net::ERR_ABORTED 404 (Not Found)
MyZ Danmaku: fallback batch still empty, scheduling retry


---

MyZ Danmaku: no comment params available for fallback
MyZ Danmaku: fallback batch still empty, scheduling retry

I found a nodejs library that wraps InnterTube API, lets migrate the extension use crxjs (refer `extension` folder for another extension use such architecture) then using this library for Youtube content access.

---

`youtubei.js@5.0.1`.
Staring from scratch is a good option, if you still remember what are we doing. Nothing important to keep.

---

MyZ Danmaku: fetch failure TypeError: Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation

---

MyZ Danmaku: fetch failure Error: Request to https://www.youtube.com/youtubei/vnull/next?key=\<REDACTED>&prettyPrint=false&alt=json failed with status 400

---

MyZ Danmaku: fetch failure Error: Request to https://www.youtube.com/youtubei/v1/next?key=\<REDACTED>&prettyPrint=false&alt=json failed with status 403

I think we should use InnterTube in content script, that we we can fetch user's credentials to invoke innertube api.

---

Error: Failed to extract signature decipher algorithm

MyZ Danmaku: fetch failure Error: Request to https://www.youtube.com/youtubei/vnull/next?key=\<REDACTED>&prettyPrint=false&alt=json failed with status 400

---

Nothing got loaded, console output:
MyZ Danmaku: applied danmaku {count: 0}

Also nothing shows in popup and badge

---

https://www.youtube.com/watch?v=hOi8s2wkX4A
content.js-BMWukv_r.js:1 MyZ Danmaku: comment page {page: 0, threads: 20, hasContinuation: true}
content.js-BMWukv_r.js:1 MyZ Danmaku: comment page {page: 1, threads: 20, hasContinuation: true}
content.js-BMWukv_r.js:1 MyZ Danmaku: comment page {page: 2, threads: 20, hasContinuation: true}
content.js-BMWukv_r.js:1 MyZ Danmaku: comment page {page: 3, threads: 20, hasContinuation: true}
content.js-BMWukv_r.js:1 MyZ Danmaku: comment page {page: 4, threads: 20, hasContinuation: true}
content.js-BMWukv_r.js:1 MyZ Danmaku: applied danmaku {count: 0}

---

Still nothing can be found. Not even I manually scroll the page that showing comment with timecode.

Can you show all comment content in console and let me check if they are actually collected with timecode?

---

MyZ Danmaku: processed comment {commentId: undefined, text: '', seconds: Array(0)}

---

Lots eof empty comment printed out:

```
MyZ Danmaku: processed comment 
{
    "text": "",
    "seconds": [],
    "raw": {
        "type": "CommentThread",
        "comment": null,
        "comment_replies_data": null,
        "is_moderated_elq_comment": false,
        "has_replies": false
    }
}
```

---

No I am not saying they are actually empty, I am saying you are got wrong content. They are actually comments with content.

Go check the API doc see whats wrong.

https://ytjs.dev/api/youtubei.js/namespaces/YT/classes/Comments.html

---

You can see there are actually things, but I am not sure you treat they're empty:

```
MyZ Danmaku: skipped empty comment 
{
    "raw": {
        "type": "CommentThread",
        "comment": null,
        "comment_replies_data": {
            "type": "CommentReplies",
            "contents": [
                {
                    "type": "ContinuationItem",
                    "trigger": "CONTINUATION_TRIGGER_ON_ITEM_SHOWN",
                    "endpoint": {
                        "type": "NavigationEndpoint",
                        "payload": {
                            "token": "Eg0SC2hPaThzMndrWDRBGAYygwEaUBIaVWd4RWMxYV9uRUxBLURfSDNCbDRBYUFCQWciAggAKhhVQ0JKeWNzbWR1dllFTDgzUl9VNEpyaVEyC2hPaThzMndrWDRBQAFICoIBAggBQi9jb21tZW50LXJlcGxpZXMtaXRlbS1VZ3hFYzFhX25FTEEtRF9IM0JsNEFhQUJBZw%3D%3D",
                            "request": "CONTINUATION_REQUEST_TYPE_WATCH_NEXT"
                        },
                        "metadata": {
                            "api_url": "next",
                            "send_post": true
                        }
                    }
                }
            ],
            "view_replies": {
                "type": "Button",
                "text": "9 replies",
                "icon_type": "EXPAND",
                "endpoint": {
                    "type": "NavigationEndpoint",
                    "payload": {},
                    "metadata": {}
                }
            },
            "hide_replies": {
                "type": "Button",
                "text": "9 replies",
                "icon_type": "COLLAPSE",
                "endpoint": {
                    "type": "NavigationEndpoint",
                    "payload": {},
                    "metadata": {}
                }
            },
            "view_replies_creator_thumbnail": [],
            "has_channel_owner_replied": false
        },
        "is_moderated_elq_comment": false,
        "has_replies": true
    }
}
```

---

Still cannot see.
But I checked youtube response there are actually content, check
```
{
  "entityKey": "EhpVZ3kzOFpsWElaNmJaTzhQbVNoNEFhQUJBZyAoKAE%3D",
  "type": "ENTITY_MUTATION_TYPE_REPLACE",
  "payload": {
    "commentEntityPayload": {
      "key": "EhpVZ3kzOFpsWElaNmJaTzhQbVNoNEFhQUJBZyAoKAE%3D",
      "properties": {
        "commentId": "Ugy38ZlXIZ6bZO8PmSh4AaABAg",
        "content": {
          "content": "A proprietary shared experience called “space time” seems probable."
        },
        "publishedTime": "1 year ago",
        "replyLevel": 0,
        "authorButtonA11y": "@sonalight",
        "toolbarStateKey": "EhpVZ3kzOFpsWElaNmJaTzhQbVNoNEFhQUJBZyAsKAE%3D",
        "translateButtonEntityKey": "EhpVZ3kzOFpsWElaNmJaTzhQbVNoNEFhQUJBZyD_ASgB"
      }
      ...
  }
}
```

---

CommentView not found! This is a bug, want to help us fix it? Follow the instructions at https://github.com/LuanRT/YouTube.js/blob/main/docs/updating-the-parser.md or report it at https://github.com/LuanRT/YouTube.js/issues! Introspected and JIT generated this class in the meantime: class CommentView extends YTNode { static type = 'CommentView'; comment_key: string; shared_key: string; toolbar_state_key: string; toolbar_surface_key: string; comment_id: string; comment_surface_key: string; shared_surface_key: string; inline_replies_key: string; renderer_context: { logging_context: { logging_directives: { tracking_params: string, visibility: { types: string }, attention_logging: string } } }; constructor(data: RawNode) { super(); this.comment_key = data.commentKey; this.shared_key = data.sharedKey; this.toolbar_state_key = data.toolbarStateKey; this.toolbar_surface_key = data.toolbarSurfaceKey; this.comment_id = data.commentId; this.comment_surface_key = data.commentSurfaceKey; this.shared_surface_key = data.sharedSurfaceKey; this.inline_replies_key = data.inlineRepliesKey; this.renderer_context = { logging_context: { logging_directives: { tracking_params: data.rendererContext.loggingContext.loggingDirectives.trackingParams, visibility: { types: data.rendererContext.loggingContext.loggingDirectives.visibility.types }, attention_logging: data.rendererContext.loggingContext.loggingDirectives.attentionLogging } } }; } }

---

I found the issue while debugging the plugin, you've used outdated version of the dependency. I've updated to latest version and please rewrite content.ts. 
I've added imports for types, make sure added enough type annotations to avoid loads of null checks.
```
import { YT, YTNodes, Helpers, ClientType, Innertube } from "youtubei.js/web"
```

---

OK I can see some of the features works now. However some are not working as expected. it only loaded 4 danmaku, lets use TOP_COMMENTS to fetch comments, and fetch more pages.

And when video plays, it shows old danmaku (timepoint that already passed) when I navigate to some timepoint. and some of them faded out even not show completely. Try dismiss them after move out of left border of the video.

---

请求有点太多了。为什么突然fork出来几百个请求。另外，拉取reply的操作不要在单个时间点内操作太频繁，容易让网络拥堵，同时也会造成Google拦截我们的请求。请：
1. 实现一个限流机制，确保指定时间段呢内只拉取少量的请求（比如5秒10个）
2. 实现一个队列，确保后续的拉取请求能够被顺利处理。
3. 在 Action Button 上显示一个 badge，展示现在已经拉取到的弹幕数量。

---

又发现了一个问题——为什么点击时间轴以后会重新加载所有的内容，同时也把popup里的弹幕列表也重置了。另外，我感觉正常加载弹幕成功以后好像并不会更新播放器的弹幕数据，即便到了对应的时间也不会正确显示弹幕。请检查这部分逻辑，把弹幕更新变成获取到以后就及时更新，弹幕时间点跟时间轴时间点匹配，并且每次切换时间点以后不用再重新拉取之前已经拉取过的弹幕——比如保存到本地。

---


我在 0:29 秒的时候忽然看到一堆（至少三条） 12:27 秒的弹幕冲了进来，换句话说，时间并没有对齐而且还存在重复。另外，我切换时间轴又发现了弹幕列表从 0 开始更新。这些数据为什么不直接保存在插件本地存储里面呢？这样我每次刷新页面也就直接进来了。 另外请同时修复时间对齐和重复显示的问题。

---

我发现问题了。你不仅把时间码给当成了时间，还把任何可以解析的数字都当成了时间——请避免这个问题。只有 hh:mm:ss 或者 mm:ss 的形式才是有效的时间码。

另外，请考虑把最大拉取数量拓展到30页，本地缓存的弹幕数据不要设置上限也不要清理。同时为了确保保存足够量的数据，请把存储的目标设置为indexDB。

另外我给innerTube的接口设置了缓存，以避免被Google拦截。

---

1. MyZ Danmaku: applied danmaku 这一行输出以后，popup里的弹幕列表会消失，而且再也不会出现。
2. 弹幕移动的速度不一致，尽量保持固定的移动速度。
3. 弹幕消失的太快，请等待弹幕完全移动到屏幕左侧，弹幕右侧接近消失，再让弹幕淡出

---

由于字幕原因，请尽可能将弹幕显示在屏幕的上半部分。

另外在视频的控制按钮旁边加上一个“弹”字的图标，用来发送新的弹幕——即给当前视频添加一个带当前播放器时间码的评论。

在视频页面直接按回车键也会触发这个操作。在发送弹幕的时候，播放暂停，发送成功以后继续。

---

并没有看到弹幕按钮。好像ensureDanmakuButton并没有被调用？

---

MyZ Danmaku: failed to submit comment Error: Comment creation is not supported in this environment

另外，弹 字按钮的样式有问题。“弹”字出现在了按钮的左下角位置。

---

发送弹幕的功能实际有限制，直接取消吧。点击“弹”字按钮在Overlay上弹一个提示：发送弹幕功能暂未实现，请在评论区通过时间码来发送弹幕。

---

action button 点开的 popup 页面直接从已经同步的数据里面读。不然又是 No timestamped comments found yet. 的结果

---

弹幕在移动过程中会有些拖影，尝试让移动的动画更流畅一些。

视频暂停的时候同时暂停弹幕的移动。

---

草泥马怎么又把我的缓存功能搞丢了？记得每获取到一个都立即同步到缓存里去，别搞太复杂的同步逻辑。另外，动画还是有问题记得把刚加进去的奇怪动画操作清理了

