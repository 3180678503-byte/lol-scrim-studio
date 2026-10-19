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

群聊简版保留标题、场数、出战人数、个人出场胜负，以及每位玩家的一行“胜负 + KDA + 原创锐评”。快照时间、数据来源说明、评选门槛说明不写进转发正文。规则榜最多展示两位不同玩家；日报仍至少 2 场、周报至少 5 场，正向席位达到 60 分、负向席位低于 45 分才展示，避免只因为凑齐门槛就夸奖或批评。原有榜单模型及评分算法保留。

锐评按当期表现选择题材，包括高胜率、逆风好面板、视野、助攻、对线经济差、经济与伤害占比、输出、补刀、低击杀参与、生存与单局英雄战绩等。辅助使用视野和助攻，不按射手的伤害标准评价；没有有效时间线时不生成对线差评语。每类有多条文案，按玩家和日期/周轮换，同一期优先使用不同文案；重新打开同一份报告内容稳定。每位玩家都保留一条锐评，不再重复四句固定榜单评语。

“完整面板”另附位置、规则分、DPM、击杀参与、伤害/经济占比、补刀、视野、GD@15 样本数和常用英雄。JSON 保留 `sourceUpdatedAt`、准确时间范围和全部结构化面板，另附 `commentary`（逐人锐评及文案标识）；机器人转发 `text` 或 `segments` 即可。使用已入库战绩，不自动查询客户端，也不自动向群聊发送消息。机器人仅需读取公开文本，不需要评分后台凭据。

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
