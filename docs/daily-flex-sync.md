# 每天凌晨四点更新灵排

本机 Windows 计划任务 `LoL-Friends-Flex-Daily-0400` 每天北京时间 04:00 执行，更新好友全量 `friends/` 和本人好友同队 `flex/`。名单来自本机仓库外的已确认私有 roster，当前是本人及 24 位好友。电脑需要开机，Windows 用户保持登录；Codex 可以关闭。

客户端未开时，任务先启动官方 WeGame，打开英雄联盟页面，识别“启动”按钮，再等待正确账号登录和好友列表就绪。只通过 WeGame 启动，不直接运行独立 TCLS 或 LeagueClient。WeGame 完全退出时也从它开始；已有客户端则直接复用。自动进入游戏依赖 WeGame 保存的登录状态；遇到扫码、验证码或更新、界面改版时，记录原因并按原重试策略等待下一次，不将启动器已出现当作采集成功。启动需要可操作的 Windows 桌面；锁屏时可复用已经登录的客户端读取数据。

采集完成后，弹出 **120 秒关闭提醒**：“取消”表示本次保持开启，“确定”立即关闭，无操作则到时执行任务管理器“结束任务”对应的操作。按本机用户设定，这一提醒也适用于运行前已经打开的客户端；即使仍在排队或游戏中，超时后同样结束所提示的客户端进程。取消关闭不影响网站更新。只针对已核对账号、PID 和启动时间的客户端，避免结束新开的其他实例；WeGame 和 Akari 保留运行。

主日报取前一天 04:00 到当天 04:00，按游戏开始时间归属。采集额外回看一天，补上上次四点时尚未结束的比赛；有已成功发布记录时，也覆盖此后漏跑的日期，所有导入按大区和比赛 ID 去重。账号历史遇到完全更早的一页停止，每账号最多 1000 条、最多四个并发。本人同队数据复用同一份采集结果和时间线，不重复查询本人。

`tools/run_daily_flex.py` 先采集，再在独立暂存目录合并、重建锐评、评分名单、日报/周报和网页；核对旧比赛保留、稳定编号、隐私字段与数据有效性后，才将公开资产写回仓库并提交。保留内战和原有共享评论数据库。GitHub Pages 构建完成且两个网站匿名访问成功才记录发布完成。

登录失败、名单变更、账号历史不完整或工作区有未提交修改时，记录具体失败原因并停止本次发布。Windows 任务设置失败后每 30 分钟重试，最多两次；同一时刻只允许一个更新任务。新增或修改不会强制覆盖他人的远端提交。

本机运行记录保存在网站仓库之外的 `outputs/private-flex/daily/`：`latest-result.json` 是最近一次结果，`state.json` 是上次成功日期，各日期运行目录保留私有采集报告及步骤日志。任何原始战绩、PUUID、登录凭据和私有名单都不提交。

可移植的手动运行方式（替换为本机路径）：

```powershell
python tools/run_daily_flex.py --private-root C:/private/lol --roster C:/private/lol/friend-roster-current.json --node C:/runtime/node.exe --git C:/runtime/git.exe --gh C:/runtime/gh.exe --dry-run
python tools/run_daily_flex.py --private-root C:/private/lol --node C:/runtime/node.exe --git C:/runtime/git.exe --gh C:/runtime/gh.exe --publish
python tools/run_daily_flex.py --private-root C:/private/lol --node C:/runtime/node.exe --git C:/runtime/git.exe --gh C:/runtime/gh.exe --auto-launch --wegame 'C:/WeGame/wegame.exe' --league-lockfile 'C:/LoL/LeagueClient/lockfile' --close-after-notice --close-notice-seconds 120 --publish
```

`--dry-run` 只显示日期、名单数量和计划，不启动软件、不采集或修改网站。`--prepare-only --input <已有私有采集JSON> --day YYYY-MM-DD` 可验证已有数据的完整构建，不修改网站、不发布。验证命令为 `python tests/test_daily_collection.py` 和 `python tests/test_client_session.py`。

可移植脚本默认只关闭本次启动且保持空闲的客户端；本机任务显式添加 `--close-after-notice` 来启用上述两分钟提醒及超时结束规则。`--keep-client` 会保留客户端；`--client-wait-seconds` 默认 300 秒。

本机 WeGame 与国服客户端以管理员身份运行，当前版本的安装目录 lockfile 为空，因此 Windows 任务使用同一用户的“最高权限”运行，读取进程中的本机连接参数并操作 WeGame。有效 lockfile 仍可通过 `LEAGUE_LOCKFILE_PATH` 或 `--league-lockfile` 使用。连接凭据只驻留内存，不输出或复制到日志，不修改 Windows UAC 设置。

WeGame 的启动步骤先在左侧最近游戏中匹配英雄联盟图标，再通过窗口归属、右下角黄色按钮形状与“启动”文字图样共同匹配，窗口移动后仍可识别；匹配不唯一、桌面不可操作或按钮文字改变时停止点击。参考图只包含游戏图标和启动按钮，没有玩家信息。自动操作依赖 Python 的 Pillow、NumPy，本机已安装。

切换外接屏和笔记本屏幕时，启动助手读取当前显示器工作区，把越界的 WeGame 窗口移回可见区域，并按多个缩放尺寸识别英雄联盟图标。选窗时优先实际可见的游戏库窗口及 WeGame 浏览器子窗口，避免选中更大的隐藏启动器占位窗口。Windows 拒绝前台切换时，会进行一次有限的输入焦点恢复；检测到用户按住修饰键则停止。仍无法操作时保留明确错误，不按旧屏幕坐标点击。

批量发布使用仓库外的 UTF-8、NUL 分隔文件清单交给 Git 暂存，避免大量历史日报、周报路径超过 Windows 命令行长度上限。
