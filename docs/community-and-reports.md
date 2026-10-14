# 群友评分与灵排日报 / 周报

## 朋友怎么用

进入任一入口的“群友评分”，先在“我是谁”选择自己的游戏 ID，再选一场对局或一天、被评价的玩家，点 1～5 星或填写评论，最后点击“提交评分 / 评论”。不需要 GitHub 或 Cloudflare 账号，浏览器会记住上次选择的 ID；ID 是自选署名。

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

报表包括去重对局、个人出场胜负、同侧好友场次、规则分席位、每人 KDA/DPM/参团/常用英雄及完整面板。日报席位最少 2 场、周报最少 5 场；只按相应全部/胜局/败局范围比较。使用已入库战绩，不自动查询客户端，也不自动向群聊发送消息。机器人仅需读取公开文本，不需要评分后台凭据。

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
```

报告日期测试覆盖 03:59/04:00、跨周与北京时间边界；共享接口测试覆盖更新评分、评论单独提交、重试去重、名单校验和限流。社区后台测试使用 Node 内存 SQLite，不写线上真实评分。
