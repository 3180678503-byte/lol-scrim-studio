# 峡谷名场面

入口：`/moments/`。内战、同队灵排和好友全量灵排的导航，以及玩家详情卡片，都有入口。三个数据页共用一份视频库。

支持[网站上传、群主账号自动投稿 B站](moments-bilibili.md)：群友明确同意公开发布后自动排队；审核通过后，网站发布封面和 B站链接；公开播放与本地备份核对后释放临时原片空间。

## 群友使用

1. 浏览视频不需要登录；可以按玩家、分类、标题/说明/英雄筛选，按最新或最早上传排序。
2. 上传新片前，选择自己的 ID 并输入群主提供的上传口令。视频点赞、评论在 B站使用自己的 B站账号进行。浏览器保存 7 天签名会话，之后重新输入。
3. 上传必填：MP4 文件、标题、1–10 位相关玩家、分类。**比赛、发生日期、英雄和说明全部选填。老视频可以一直不关联比赛。**
4. 同一段视频关联多个 ID，仍只有一个 BV；每位相关玩家的筛选结果里都会出现。
5. 点击封面、标题或「去 B站观看」直接打开稿件；「评论 / 点赞」进入 B站该稿件评论区。
6. 本浏览器保留自己上传视频的管理凭证，可删除对应视频；换浏览器后联系群主处理。选择 ID 是群内署名，不是游戏账号身份认证。

## 容量和格式

- MP4，单条最多 100,000,000 字节，最长 180 秒；建议导出 H.264 视频与 AAC 音频。
- 每个 ID 每个北京时间自然日最多 5 个仍保留的上传/上传预约。取消或删除后可重新上传。
- 总容量上限 10,000,000,000 字节。每条额外预留 120,000 字节封面空间，防止多个上传同时占满容量。
- 封面在上传者浏览器生成；目录和封面随网页一起加载。浏览和筛选不调用 Cloudflare，也不加载视频或内嵌播放器。
- 上传进度可见；失败后清理预约，过期上传由后台每小时清理。未完成的预约会过期清理；已转存视频在公开验证与本机备份通过后清理临时原片。

## 存储和接口

网站继续由 GitHub Pages 提供。现有上传 Worker 与 D1 保存元数据和玩家关联，R2 临时接收原片；旧视频评论保留为历史数据。新的视频互动在 B站进行，原比赛评分保持独立。国内迁移版使用同域 Node + SQLite 和临时文件存储，见 [部署说明](../server/DEPLOY.md)。

上传通过短期随机凭证，Worker 将请求体流式写入 R2。上传后核对文件大小和 MP4 标识，再公开展示。播放支持 GET/HEAD、HTTP Range 与拖动进度条。

| 接口 | 用途 |
| --- | --- |
| `GET /catalog`、`GET /usage` | 名单、可选比赛与容量 |
| `POST /session` | 验证群口令，生成签名会话 |
| `GET /moments` | 分类、玩家、关键词与分页查询 |
| `POST /moments` | 校验信息、原子预留容量，生成上传和管理凭证 |
| `PUT /moments/:id/upload` | 上传 MP4 |
| `PUT /moments/:id/poster` | 上传可选 JPEG 封面 |
| `GET /moments/:id`、`GET/HEAD /moments/:id/video` | 视频信息与播放 |
| `GET/HEAD /moments/:id/poster` | 封面 |
| `POST /moments/:id/likes` | 历史兼容接口，新页面前往 B站点赞 |
| `GET/POST /moments/:id/comments` | 历史兼容接口，新页面前往 B站评论 |
| `DELETE /moments/:id` | 凭该视频管理凭证或管理员口令删除 |

所有口令和实际部署配置均不进入 Git。视频文件不提交到仓库。

## 部署

首次需在 Cloudflare 控制台启用 R2。安装 `backend/package.json` 中的 Wrangler 后：

1. 复制 `backend/moments.wrangler.jsonc` 为已忽略的 `backend/moments.deploy.jsonc`，填入实际 D1 绑定。
2. 创建 R2 bucket：`wrangler r2 bucket create lol-scrim-moments`。
3. 初始化新增表：`wrangler d1 execute lol-scrim-community --remote --config backend/moments.deploy.jsonc --file backend/moments-schema.sql`。
4. 设置 Secrets：`GROUP_CODE`（群友上传口令）、`SESSION_SECRET`（随机签名密钥）、`ADMIN_KEY`（仅管理员保存）。
5. `wrangler deploy --config backend/moments.deploy.jsonc`。将实际 Worker 地址填入根目录 `moments-config.js`。

若 R2 尚未启用，可以先部署不含 `r2_buckets` 的配置；页面仍能浏览封面目录。开通后补回 `MEDIA` 绑定并重新部署即可启用上传。

`tools/build-community-manifest.cjs` 同时维护名单和选填比赛标签，现有凌晨导入会继续更新它。个人真实对局数据与视频归档无需绑定。

## 验证与回退

`node tests/moments.test.mjs` 覆盖不关联比赛、多玩家归档、签名会话、大小/格式检查、Range 播放、点赞、评论重试、删除、容量和过期清理。`node tests/community.test.mjs` 验证原评分不受影响。

变更前标签：`pre-moments-20261015`；备份分支：`backup/before-moments-20261015`。恢复旧导航和界面、保留已上传视频：

```powershell
git restore --source=pre-moments-20261015 -- index.html app.js friends/index.html friends/friends.js flex/index.html flex/flex.js styles.css
git add -- index.html app.js friends/index.html friends/friends.js flex/index.html flex/flex.js styles.css
git commit -m "Restore dashboard before moments gallery"
git push origin main
```

这只恢复界面，不删除 R2 视频或 D1 内容。需要停止新增上传时，可单独修改群口令与签名密钥。管理员口令不要分享到群里。
