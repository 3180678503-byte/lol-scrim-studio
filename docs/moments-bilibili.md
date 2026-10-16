# 网站上传，群主账号自动投稿 B站

群友在「峡谷名场面」选文件、标题、相关玩家，勾选公开发布授权后上传。比赛、日期、英雄仍然选填。浏览网站和发表评论的方式不变。

流程：网站上传 → R2 暂存并立即供本站播放 → 本机领取任务 → biliup 投稿 → 等待 B站审核与转码 → 本站改用 B站官方播放器 → 保留期结束且本地备份校验通过，释放 R2 原片空间。封面、玩家关联、点赞、评论继续保留。

## 群友如何操作

1. 打开 [峡谷名场面](https://3180678503-byte.github.io/lol-scrim-studio/moments/)，选择自己的 ID、输入群口令。
2. 上传 MP4，填写标题、相关玩家和分类。
3. 默认选择「自动同步到群主 B站账号」，需要勾选「我有权发布这段视频，同意以群主 B站账号公开投稿」。录制者应获得片段发布所需的授权。
4. 页面显示等待同步、正在投稿、审核/转码等状态。审核通过后，可在本站观看 B站播放器，也能跳转 B站。
5. 取消自动同步时只存 R2，继续占用本站空间。旧视频由群主明确选择搬运后才进入队列；系统单独记录群主搬运授权，不会把它记作原上传者勾选了授权。

所有同步稿件以群主账号公开发布，会出现在 B站创作中心。删除本站归档会同时删除本站评论；B站已投稿内容需群主在创作中心另行删除，删除对话框会提示。

## 群主首次设置

运行环境：Windows、Python 3.10+，以及从 [biliup 官方发布页](https://github.com/biliup/biliup/releases) 获取的 Windows 便携版。本次核对的版本为 **v1.2.11**，实际 `upload --help` 支持 `--submit web`。上游程序和源码下载在网站仓库之外。

1. 把 [示例配置](../tools/moments-bilibili.example.json) 复制到仓库外的私有目录。填写程序路径、Worker 地址和专用 `archiveKey`；此密钥只用于本机和 Worker 之间领取转存任务。
2. 对已有视频数据库执行新增表迁移：`backend/moments-schema.sql` 全部使用 `CREATE TABLE/INDEX IF NOT EXISTS`，不改动既有比赛、评分或视频记录。
3. 在视频 Worker 设置同值的 `ARCHIVE_KEY` Secret，再部署 `backend/moments.deploy.jsonc`。B站 Cookie 只保存在电脑，不上传 Cloudflare。
4. 在本机终端执行以下命令，菜单选择「扫码登录」，用 B站 App 扫码并确认。二维码也会保存在私有运行目录 `qrcode.png`。登录过期时重新运行登录命令。

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --login
python tools/moments_bilibili.py --config C:/private-moments/config.json --doctor
# 只读查看队列，不投稿、不删除文件
python tools/moments_bilibili.py --config C:/private-moments/config.json
# 实际投稿已获得公开发布授权的片段
python tools/moments_bilibili.py --config C:/private-moments/config.json --publish
```

本机任务每 10 分钟运行一次，并在用户登录 Windows 后运行；无需开 LOL 或 Akari。关机、睡眠或未登录 Windows 时先在 R2 排队，恢复后补传。初次登录前程序以 `login_required` 退出，不领取任务。过期登录以 `login_expired_rescan_required` 退出。无需打开本聊天保持自动运行。

默认每轮最多投稿 2 条、每天最多 20 条（北京时间自然日），这是本机节流配置，可在 `maxPerRun`、`maxPerDay` 调整；不是 B站官方额度。单条仍为 3 分钟 / 100MB、每个群友每天 5 条。R2 保持 10GB 暂存上限，空间满后暂停接收新视频。

## 投稿标签与简介

投稿自动使用网站填写的信息：游戏「英雄联盟」→ 视频分类 → 英雄 → 相关玩家 ID →「峡谷名场面」。例如「煎饼狗子惊天芮尔Q闪W」会带上「下饭操作」「芮尔」「煎饼狗子」「qwer」等标签，相关玩家包括网站勾选的所有人。

单条最多生成 10 个标签，每个最多 20 个字符；忽略重复项，逗号和换行转为空格。ID 使用网站显示名，不带区分码。超过标签数量的玩家仍完整保存在简介中。简介同时保留原说明、分类、英雄、相关玩家、已填写的对局日期/比赛编号和网站入口；未填写的英雄或比赛不会自动猜测。每条简介的唯一视频编号用于防止重复投稿。

游戏标签默认「英雄联盟」。其他游戏片段可由群主在私有配置中设置 `metadataOverrides: {"<视频 UUID>": {"game": "无畏契约"}}`。例如第一批搬运中的「神之空摘」已按实际画面使用「无畏契约」标签；网站玩家、分类和评论继续共用原记录。

群主搬运旧视频时，管理程序对指定视频调用 `POST /archive/enroll`，JSON 为 `{"id":"<视频 UUID>","authorization":"owner-migration-v1"}`。接口同时要求私有 `X-Archive-Key` 与 `X-Admin-Key`，只能加入已上传完成且原片仍存在的视频。重复调用复用原任务和 BV 号，保留原来的玩家关联、点赞和评论。两种密钥都不应放入前端或仓库。

## 原片保留与恢复

默认 `retainDays: 7`。B站首次验证通过后至少保留 7 天 R2 原片；后台还要求最近 10 分钟内公开状态、投稿账号、BV 号、cid 核对通过，并且本机备份 SHA-256 与首次下载相符，才释放 R2 视频对象。平台审核未通过、暂不可访问、网络错误、备份缺失或损坏时保留原片。封面仍留在 R2。

本机 `backups/<视频编号>.mp4` 永久保留，程序不会自动删除。长期视频增长会占用本机硬盘；可由群主管理备份盘。B站对外播放版本经过平台转码，本机 MP4 保留原文件。

## 投稿异常与防重复

- 同一任务仅一个有效租约；下载中断可以重试，最多领取 5 次。
- 调用投稿前先把任务标记为 `submitting`，并写本机收据。取得 BV 号后先落盘，再登记到网站。
- 程序中断、投稿超时或返回不明确时不重新上传。后台会只读查询当前账号创作中心最近 90 条稿件，用完全匹配的标题和独立一行的视频编号查找 BV 号；唯一命中时自动补登记，包括仍在审核的稿件。无法确认或命中多个时显示「投稿结果待群主核对」。
- 每条稿件简介包含「名场面编号：<网站 UUID>」，用于核对，避免误绑定其他视频。

确认 B站已有相应稿件后，用公开 BV 号恢复（必须同账号、简介编号匹配、已经公开可访问）：

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --attach 11111111-1111-4111-8111-111111111111 BV1xx411c7mD
```

`last-run.json` 保存状态摘要，`receipts/` 保存原片散列和 BV 号。第三方工具的原始输出可能带登录信息，因此只在内存解析，不保存或公开。账号 Cookie、私有配置和密钥不进 GitHub。

## 按网站分类加入 B站空间视频列表（当前使用）

使用 B站个人空间里的「系列」实现四类视频列表：

- [名场面](https://space.bilibili.com/353511010/lists/5182584?type=series)：网站「神操作」。
- [下饭操作](https://space.bilibili.com/353511010/lists/5182585?type=series)。
- [默契配合](https://space.bilibili.com/353511010/lists/5182586?type=series)。
- [整活现场](https://space.bilibili.com/353511010/lists/5182587?type=series)。

四个列表已创建，空列表也可分享。网站视频页提供入口。朋友上传时仍只选网站分类；投稿标题自动加上「【神操作】」「【下饭操作】」等分类前缀，B站列表设置相应关键词，供新投稿自动同步。后台在公开稿件验证通过后还会核对对应列表，必要时主动加入并读取确认。归类失败下次重试，不会重新上传视频；本机收据避免重复添加。比赛与相关玩家标签均不影响分类。

查询账号的视频列表权限和列表，或在其他账号下初始化同样四类：

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --series
python tools/moments_bilibili.py --config C:/private-moments/config.json --setup-series
```

初始化只创建空列表与分类关键词，不把账号原有视频混入；已有同名列表会复用，多个同名时暂停。私有 `categoryCollections` 中每项 `kind: "series"` 对应 `seriesId`，由原自动任务使用。列表封面由 B站根据列表视频展示，`assets/collection-covers/` 保留供将来投稿合集使用。

## 投稿合集（可选，需要账号权益）

支持四个独立的 B站**投稿合集**：

| 网站分类 | B站合集名 |
| --- | --- |
| 神操作 | 名场面 |
| 下饭操作 | 下饭操作 |
| 默契配合 | 默契配合 |
| 整活现场 | 整活现场 |

合集需要账号拥有相应 B站权益。先查询官方预检的 `season` 开关：

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --collections
```

`canCreate: false` 表示当前账号尚未开通投稿合集。此时普通视频投稿、空间视频列表和网站分类继续工作；程序不会反复尝试创建投稿合集。投稿合集与空间系列是 B站的两种功能。

账号开通权益后，一次性创建/绑定四个合集：

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --setup-collections
```

四张封面使用仓库 `assets/collection-covers/`，也可用 `--collection-covers <目录>` 指定。命令先检查权限，再复用同名合集或新建；逐个保存合集和默认小节的 ID 到私有配置 `categoryCollections`。同名合集不唯一时暂停，避免误绑定。创建操作只有显式执行该命令时发生。

初始化成功后，原有自动任务在稿件审核通过后，按网站分类加入对应合集，再读取小节确认加入成功。本机收据保存归类结果，重复执行不重复添加。核对不通过或网络失败时保留待重试；不会因此重新投稿，同步归类成功后才继续释放到期 R2 原片。归类依据是上传时的网站分类，与玩家标签、比赛选填项独立。

## 测试与回退

```powershell
node tests/moments.test.mjs
node tests/moments-archive.test.mjs
python tests/moments_bilibili_test.py
python tests/bilibili_collections_test.py
node tests/community.test.mjs
```

本地测试覆盖明确授权、群主搬运旧视频、玩家/英雄标签、标签数量和长度、并发领取、提交结果不明不重复投稿、账号核对、保留期、备份、释放容量、保留互动以及已删除视频不能被后台重新激活。真实投稿通过后还需核对 B站公开播放、实际标签和列表成员。

发布前保留 `pre-bilibili-20261016` 标签。暂停自动投稿可禁用 Windows 的 `LoL-Moments-Bilibili-Sync` 计划任务；已存视频继续可看。新增表向后兼容，恢复旧前端/Worker 时无需删除表。已经释放 R2 原片的记录需要保留新播放器页面，或先从本机备份恢复原片再回退旧播放器。
