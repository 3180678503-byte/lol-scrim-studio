# 每天凌晨四点更新灵排

本机 Windows 计划任务 `LoL-Friends-Flex-Daily-0400` 每天北京时间 04:00 执行，更新好友全量 `friends/` 和本人好友同队 `flex/`。名单来自本机仓库外的已确认私有 roster，当前是本人及 24 位好友。电脑需要开机，Windows 用户保持登录，英雄联盟客户端已登录；Codex 可以关闭。

主日报取前一天 04:00 到当天 04:00，按游戏开始时间归属。采集额外回看一天，补上上次四点时尚未结束的比赛；有已成功发布记录时，也覆盖此后漏跑的日期，所有导入按大区和比赛 ID 去重。账号历史遇到完全更早的一页停止，每账号最多 1000 条、最多四个并发。本人同队数据复用同一份采集结果和时间线，不重复查询本人。

`tools/run_daily_flex.py` 先采集，再在独立暂存目录合并、重建锐评、评分名单、日报/周报和网页；核对旧比赛保留、稳定编号、隐私字段与数据有效性后，才将公开资产写回仓库并提交。保留内战和原有共享评论数据库。GitHub Pages 构建完成且两个网站匿名访问成功才记录发布完成。

登录失败、名单变更、账号历史不完整或工作区有未提交修改时，记录具体失败原因并停止本次发布。Windows 任务设置失败后每 30 分钟重试，最多两次；同一时刻只允许一个更新任务。新增或修改不会强制覆盖他人的远端提交。

本机运行记录保存在网站仓库之外的 `outputs/private-flex/daily/`：`latest-result.json` 是最近一次结果，`state.json` 是上次成功日期，各日期运行目录保留私有采集报告及步骤日志。任何原始战绩、PUUID、登录凭据和私有名单都不提交。

可移植的手动运行方式（替换为本机路径）：

```powershell
python tools/run_daily_flex.py --private-root C:/private/lol --roster C:/private/lol/friend-roster-current.json --node C:/runtime/node.exe --git C:/runtime/git.exe --gh C:/runtime/gh.exe --dry-run
python tools/run_daily_flex.py --private-root C:/private/lol --node C:/runtime/node.exe --git C:/runtime/git.exe --gh C:/runtime/gh.exe --publish
```

`--dry-run` 只显示日期、名单数量和计划，不采集或修改网站。`--prepare-only --input <已有私有采集JSON> --day YYYY-MM-DD` 可验证已有数据的完整构建，不修改网站、不发布。验证命令为 `python tests/test_daily_collection.py`。

当客户端以管理员身份运行时，本机任务使用安装目录的 lockfile 读取当前连接，避免给整个定时任务提升权限。路径可通过任务环境变量 `LEAGUE_LOCKFILE_PATH` 配置；内容只在内存使用，不输出或复制到日志。
