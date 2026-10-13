# 好友灵排与 Akari 收集模式

Akari 收集模式是带筛选的分页流程，不是返回 1,000 场的独立接口。官方项目 v1.5.1 的 `src/shared/http-api-axios-helper/sgp/match-history-query.ts` 支持 `startIndex`、`count`、`tag`、`tagsQueryType`；灵排为 `tag=q_440`。`page-size-options.ts` 中收集选项为 300/500/750/1000。最多扫描 1,000 场不代表服务器必定保留 1,000 场。停止条件为短页、空页、重复页或达到上限；发生查询错误时不能宣称已到历史尽头。

## 采集范围与数据隔离

- 只读当前账号的灵排摘要，按 `/lol-chat/v1/friends` 名单匹配本人队伍，至少一位当时好友同队才入库。只统计本人和这些同队好友，不拉取所有好友的全部历史。好友同队不是已验证共同组队。
- LCU/SGP 凭据只驻留内存。完整朋友名单、PUUID、陌生人原始数据放在仓库之外；公开仅保留统计选手、匿名双方总量及对位差。远程请求保持正常 TLS 校验。
- 客户端若以管理员身份运行，普通进程可能看不到其命令行/lockfile。根据会话已有授权使用范围固定的临时只读助手；不要输出进程命令行或认证字段。脚本强制 UTF-8 CIM 输出，避免中文安装目录导致解析失败。
- 每次导出使用新的日期文件名。DETAILS 遇到暂时连接错误最多重试一次；仍缺失就标出覆盖率，不填造时间线。
- 灵排使用 `flex/data.json`，内战使用根目录 `data.json`。保持一个灵排数据集的采集中心账号一致，不能把朋友自己账号的战绩直接覆盖到本人的队伍与胜率定义里。账号改名应先核对私有身份后明确迁移昵称；另一账号使用独立数据集。

## 更新命令（在网站根目录）

```text
python skills/lol-scrim-update/scripts/collect_flex.py --output ../private-data/flex-YYYYMMDD.json --report ../private-data/flex-report-YYYYMMDD.json --max-games 1000 --timeline-limit 1000
python skills/lol-scrim-update/scripts/merge_flex.py --site flex --input ../private-data/flex-YYYYMMDD.json --scrim-site .
python skills/lol-scrim-update/scripts/review_flex.py --site flex
python skills/lol-scrim-update/scripts/build.py --site flex --resource-root . --html ../好友灵排数据演播室.html --download-icons
```

`merge_flex.py` 先计算完整五人分母和真实同位置对位差，再删除陌生人的玩家行；不能在删除后用两三个好友当团队分母。完整匿名敌方团队数据仅供局势背景。按大区+比赛 ID 去重，保留稳定编号和更完整时间线。私有 PUUID 用于统一本次覆盖历史中的改名；历史超出服务器范围时保留原先导入，不凭昵称猜身份。可传 `--champion-metadata <腾讯 hero_list JSON>` 补充英雄中文名。

## 评分和锐评

`review_flex.py` 生成透明的同位置指标百分位加权分、每局好友 MVP（胜局）或 SVP（败局）、好友最低分位及逐人原创规则评语。辅助重视参团、视野、控制，缺失指标重新归一，不把自动规则榜称为人工回放分析或官方 MVP。保留证据、评分权重、基准场数与争议限制；重要/异常结论应抽样复核，用户需要人工分析时另做具体点评。不得评选未统计的敌方和陌生队友。

集合总评按所选比赛重新计算：综合 MVP 统计全部；SVP 与败局背锅只看败局；胜局搭车只看胜局。默认至少 5 场，所选对应范围不足 5 场时使用其实际场数，页面显示门槛。位置筛选应同时限制候选与统计。筛选不重算全历史评分基准，新数据导入时基准会更新。

## 验证与发布

核对实际查询数、好友同队数、入库数、时间线数与停止原因。验证公开玩家行严格属于对应私有名单且同队，团队分母仍来自完整队伍，对位差逐项对应真实帧；重复导入不增加比赛。检查逐局奖项、任意集合、两组比较、日期筛选、手机和离线 HTML；根目录内战历史不变。发布时按已有任务授权更新仓库，再匿名验证根目录与 `/flex/`，不只验证其中一个。
