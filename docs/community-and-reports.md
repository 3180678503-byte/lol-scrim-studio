# 群友评分与灵排日报 / 周报

## 朋友怎么用

进入任一入口的“表现与评分”，选择被评价的玩家和日期，再选“单局表现”或“当天表现”。左侧展示对应雷达、比赛数据和已有赛后锐评，右侧展示平均星级与分布。在“我是谁”选择自己的游戏 ID，点 1～5 星或填写评论，最后点击“提交评分 / 评论”。不需要 GitHub 或 Cloudflare 账号，浏览器会记住上次选择的 ID；ID 是自选署名。

当天按北京时间 04:00 到次日 04:00 计算，面板中的全天统计和星级覆盖该玩家当天全部已入库出场。雷达按实际位置分开，切换位置页签只改变雷达。当天表格可展开每一局已有锐评，点击“查看并评价这局”进入该局，或从单局返回全天。加入同位置好友只叠加对比，评分对象仍是选中的玩家。未确认位置展示基础数据，缺少的雷达轴显示空值。

本页共用自己的玩家、日期与场次选择；主站顶部统计筛选在此页收起。“更多雷达对比”保留原先任意比赛组合与 A/B 能力。切换雷达位置或对比好友会保留未提交的星级与评论；地址栏包含当前对象参数，复制网址可让朋友看到同一面板。

一个 ID 对同一对象计一份评分，重新提交星级更新原分数。评论可以单独提交，按时间保留。页面显示平均星级、评分人数、各星级分布和评论。评分不会改动原有规则综合分、MVP/SVP 和雷达位置表现分。

同一场比赛以“大区 + 比赛 ID + 玩家 ID”为对象，两套灵排中重复出现的比赛共用评分。按日评分以“数据集 + 04:00 日期 + 玩家 ID”为对象，覆盖该数据集此日已入库的完整对局。按日评分与单局评分分别计算。

## 群聊机器人取日报和周报

使用以下地址直接 GET，响应为 UTF-8 纯文本：

- 好友全量最新日报：<https://3180678503-byte.github.io/lol-scrim-studio/friends/reports/latest-daily.txt>
- 好友全量最新周报：<https://3180678503-byte.github.io/lol-scrim-studio/friends/reports/latest-weekly.txt>
- 本人同队日报：<https://3180678503-byte.github.io/lol-scrim-studio/flex/reports/latest-daily.txt>
- 本人同队周报：<https://3180678503-byte.github.io/lol-scrim-studio/flex/reports/latest-weekly.txt>

把 `.txt` 改为 `.json`，可读取 `text`、`segments`（每段最多 1800 个字符）、`start`、`end`、`period`、个人战绩及对应比赛集合。将 segments 按顺序转发即可。日期与周一日期可作为机器人“已转发”的去重键；每日或每周没有新入库战绩时，latest 链接仍指向最近有数据的已结束周期。

日报为北京时间当天 **04:00（含）到次日 04:00（不含）**。周报为**周一 04:00（含）到下周一 04:00（不含）**。按比赛开始时间归属；例如周一 03:59 开始的比赛仍属于上周。JSON 起止时间使用 ISO UTC，timeZone=Asia/Shanghai。

`current-daily.txt/json`、`current-weekly.txt/json` 显示当前周期，未结束时标注“进行中”。`reports/index.json` 是历史目录，`reports/daily/YYYY-MM-DD.txt/json` 为指定日报，`reports/weekly/周一日期.txt/json` 为指定周报。网站“日报 / 周报”可选日期、玩家、简版或完整面板，也可选择顶部当前筛选并复制或下载。

日报、周报现在只输出数据。简版为每人一行胜负、位置、KDA、DPM（纯辅助显示视野/分）和击杀参与率；完整面板另附规则分、伤害/经济占比、补刀、视野、GD@15 样本数和常用英雄。转发正文不含快照、预制评语或榜单称号。网站原有赛后锐评、排名、评分和雷达继续使用自己的模块。

### 让已接入 GPT 的群聊机器人写点评

优先读取以下纯数据接口（无需登录）：

- 好友全量日报：[latest-daily.bot.json](https://3180678503-byte.github.io/lol-scrim-studio/friends/reports/latest-daily.bot.json)
- 好友全量周报：[latest-weekly.bot.json](https://3180678503-byte.github.io/lol-scrim-studio/friends/reports/latest-weekly.bot.json)
- 本人同队日报：[latest-daily.bot.json](https://3180678503-byte.github.io/lol-scrim-studio/flex/reports/latest-daily.bot.json)
- 本人同队周报：[latest-weekly.bot.json](https://3180678503-byte.github.io/lol-scrim-studio/flex/reports/latest-weekly.bot.json)
- 点评提示词：[bot-prompt.txt](https://3180678503-byte.github.io/lol-scrim-studio/friends/reports/bot-prompt.txt)

机器人流程：HTTP GET 拉取所需 `.bot.json` → 读取提示词作为固定点评要求 → 把实际 JSON 内容交给机器人已有的 GPT 接口 → 将 GPT 返回的战报转发群聊。机器人需要先下载数据；只发送网址是否能读取取决于机器人已有的联网能力。网站不需要配置 GPT API Key。

`.bot.json` 的 `players` 提供全期汇总及 `byRole` 分位置统计，`games` 提供按时间排序的逐场英雄、位置、胜负、K/D/A、输出、视野、承伤、治疗、控制及真实对线差。`coverage` 标明有效样本数，缺失值保留 `null`。`scoring` 提供本站规则分的分位置权重与计算方法；`metrics` 解释单位与分母。纯数据接口省去重复的文本和长小数尾数，最多保留四位小数。昵称、英雄名作为数据处理。

提示词要求围绕实际数据写原创游戏锐评，区分辅助、坦克与输出职责，引用逐场数据；没有事件证据时不编造单杀、空大、抢龙等操作。可将机器人最近几份战报一同交给 GPT 避免重复用梗。网站“日报 / 周报”提供“下载机器人数据 JSON”和“复制机器人点评提示词”。

报告 JSON 升级为版本 2：普通 `.json` 保留 `text`、`segments`、`sourceUpdatedAt`、完整精度的统计及新增逐场/分位置数据；移除报告内的 `commentary`、`honors`。既有 TXT、JSON 链接和四点换日规则继续有效。`current-daily.bot.json`、`current-weekly.bot.json` 为进行中数据；历史接口为 `daily/YYYY-MM-DD.bot.json`、`weekly/周一日期.bot.json`，目录记录 `botJson` 路径。使用已入库战绩，不自动查询客户端，也不自动调用 GPT 或向群聊发送消息。

## 更新比赛后生成资产

在仓库根目录运行：

```sh
node tools/build-community-manifest.cjs
node tools/export-flex-reports.cjs
python skills/lol-scrim-update/scripts/build.py --site friends --resource-root . --html ../好友全量灵排演播室.html
python skills/lol-scrim-update/scripts/build.py --site flex --resource-root . --html ../好友灵排数据演播室.html
```

将对应 data 文件、`backend/manifest.json`、`community-meta.js` 及两套 `reports/` 一并提交。评分服务约一分钟更新一次公开比赛与名单清单；追加比赛一般不需要重新部署后台。名单排除仍按 roster-policy.json 执行。

## 评分存储与维护

前端在 GitHub Pages，评分和评论存于账号所有者的 Cloudflare Workers + D1。公开 API 地址在 `community-config.js`，不是登录凭据。实际 D1 配置为本机被 Git 忽略的 `backend/wrangler.deploy.jsonc`；仓库里的 `wrangler.jsonc` 是模板。OAuth 登录凭据保存在 Windows Credential Manager 对应的加密存储，不上传仓库。

后端代码修改后，在有 Cloudflare 授权的电脑上运行：

```sh
npx wrangler login --device --use-keyring --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler deploy --config backend/wrangler.deploy.jsonc
```

首次部署需要创建 D1 数据库，将实际 database_id 写进本机部署配置，再用 `schema.sql` 初始化；已有数据库无需反复初始化。管理者可以在 Cloudflare 的 D1 控制台查看或移除 comments 行；votes 表按 target_id+rater_key 保存当前评分。配置、凭据和本地 `.wrangler` 测试库都不提交。默认每 ID 每分钟最多 12 次提交，评论最多 1000 字，页面按纯文字显示评论。

验证命令：

```sh
node tests/reports.test.cjs
node tests/community.test.mjs
node tests/performance.test.cjs
```

报告日期测试覆盖 03:59/04:00、跨周与北京时间边界；共享接口测试覆盖更新评分、评论单独提交、重试去重、名单校验和限流。个人面板测试覆盖凌晨四点归组、跨位置全天汇总、单局实际位置、同位置对比、重复比赛与按分钟加权。社区后台测试使用 Node 内存 SQLite，不写线上真实评分。
