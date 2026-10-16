# 网站上传，群主账号自动投稿 B站

群友在「峡谷名场面」选文件、标题、相关玩家，勾选公开发布授权后上传。比赛、日期、英雄仍然选填。浏览网站和发表评论的方式不变。

流程：网站上传 → R2 暂存并立即供本站播放 → 本机领取任务 → biliup 投稿 → 等待 B站审核与转码 → 本站改用 B站官方播放器 → 保留期结束且本地备份校验通过，释放 R2 原片空间。封面、玩家关联、点赞、评论继续保留。

## 群友如何操作

1. 打开 [峡谷名场面](https://3180678503-byte.github.io/lol-scrim-studio/moments/)，选择自己的 ID、输入群口令。
2. 上传 MP4，填写标题、相关玩家和分类。
3. 默认选择「自动同步到群主 B站账号」，需要勾选「我有权发布这段视频，同意以群主 B站账号公开投稿」。录制者应获得片段发布所需的授权。
4. 页面显示等待同步、正在投稿、审核/转码等状态。审核通过后，可在本站观看 B站播放器，也能跳转 B站。
5. 取消自动同步时只存 R2，继续占用本站空间。旧视频不会自动追加公开发布授权。

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

## 原片保留与恢复

默认 `retainDays: 7`。B站首次验证通过后至少保留 7 天 R2 原片；后台还要求最近 10 分钟内公开状态、投稿账号、BV 号、cid 核对通过，并且本机备份 SHA-256 与首次下载相符，才释放 R2 视频对象。平台审核未通过、暂不可访问、网络错误、备份缺失或损坏时保留原片。封面仍留在 R2。

本机 `backups/<视频编号>.mp4` 永久保留，程序不会自动删除。长期视频增长会占用本机硬盘；可由群主管理备份盘。B站对外播放版本经过平台转码，本机 MP4 保留原文件。

## 投稿异常与防重复

- 同一任务仅一个有效租约；下载中断可以重试，最多领取 5 次。
- 调用投稿前先把任务标记为 `submitting`，并写本机收据。取得 BV 号后先落盘，再登记到网站。
- 程序中断、投稿超时或返回不明确时不重新上传，显示「投稿结果待群主核对」。下次运行若收据已有 BV 号会补登记；没有 BV 号需在 B站创作中心核对。
- 每条稿件简介包含「名场面编号：<网站 UUID>」，用于核对，避免误绑定其他视频。

确认 B站已有相应稿件后，用公开 BV 号恢复（必须同账号、简介编号匹配、已经公开可访问）：

```powershell
python tools/moments_bilibili.py --config C:/private-moments/config.json --attach 11111111-1111-4111-8111-111111111111 BV1xx411c7mD
```

`last-run.json` 保存状态摘要，`receipts/` 保存原片散列和 BV 号。第三方工具的原始输出可能带登录信息，因此只在内存解析，不保存或公开。账号 Cookie、私有配置和密钥不进 GitHub。

## 测试与回退

```powershell
node tests/moments.test.mjs
node tests/moments-archive.test.mjs
python tests/moments_bilibili_test.py
node tests/community.test.mjs
```

本地测试覆盖明确授权、并发领取、提交结果不明不重复投稿、账号核对、保留期、备份、释放容量、保留互动以及已删除视频不能被后台重新激活。真实 B站投稿与审核需要扫码登录后，用一条已授权的实际视频验证。

发布前保留 `pre-bilibili-20261016` 标签。暂停自动投稿可禁用 Windows 的 `LoL-Moments-Bilibili-Sync` 计划任务；已存视频继续可看。新增表向后兼容，恢复旧前端/Worker 时无需删除表。已经释放 R2 原片的记录需要保留新播放器页面，或先从本机备份恢复原片再回退旧播放器。
