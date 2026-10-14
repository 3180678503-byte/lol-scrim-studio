# 当前内战演播室

用户本次建立的公开仓库：https://github.com/3180678503-byte/lol-scrim-studio

公开站点：https://3180678503-byte.github.io/lol-scrim-studio/

好友灵排：https://3180678503-byte.github.io/lol-scrim-studio/flex/ 。根目录保留自定义内战，`flex/` 使用独立数据、页面与规则娱乐锐评；采集中心账号请读取该数据集的 `focusPlayerKey`，不要硬编码账号或日期。好友范围使用采集时客户端名单，朋友本人导入另一个账号时应单独建数据集。

多账号好友全量：https://3180678503-byte.github.io/lol-scrim-studio/friends/ 。名单位于 `friends/data.json` 的 `cohort` 字段，目前为本人及已确认的 24 位好友。读取各人自己的灵排，合并共同比赛，并纳入本人未参与的比赛；使用 `merge_friends_flex.py` 合并。

网站和 data.json 在 main 分支根目录，GitHub Pages source 为 main /。这是用户未另行指定项目时的默认定位线索；先确认本地 checkout 的 remote，避免误更新其他仓库。不存在本地 checkout 时可正常克隆公开仓库。初始四场数据仅作为历史记录，不限制后续比赛日期或人数集合。

追加比赛需要本机已登录游戏或用户提供私有导出。公开网站不能向朋友的浏览器暴露 LCU/SGP 凭证，也不能直接从公网连接主机的游戏客户端。用户只是查看公开站点时不进行新采集或推送。

名单修正后复用当前已确认的私有 roster；当前项目的更新名单在 `outputs/private-flex/friend-roster-current.json`，旧日期导出保留为原始快照。不要因旧导出里出现某人就自动恢复名单。本人包含在单人雷达和同位置对比中。
