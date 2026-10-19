# 内战数据演播室

英雄联盟国服自定义内战的公开复盘看板。浏览无需登录，可在 GitHub Pages 或本地直接打开；共享星级与评论使用 Cloudflare Workers + D1。

新增 **[好友灵排板块](https://3180678503-byte.github.io/lol-scrim-studio/flex/)**：与内战独立统计，支持好友排行、逐局复盘与原创规则锐评、任意集合总评和 A/B 比较。当前采集中心为 qwer，只统计本人及其当场同队的客户端好友。

新增 **[好友全量灵排](https://3180678503-byte.github.io/lol-scrim-studio/friends/)**：查询原来有同队记录的 24 位好友各自的灵排，再与本人合并；包括本人未参与和仅一位名单选手参战的比赛。可筛选某位选手或至少两位名单选手同队的比赛。

**公开网站：[内战数据演播室](https://3180678503-byte.github.io/lol-scrim-studio/)**

本地查看：克隆仓库后，用浏览器打开仓库根目录的 `index.html` 即可查看已有内战数据，无需安装依赖或启动服务。

## 峡谷名场面

新增 **[峡谷名场面](https://3180678503-byte.github.io/lol-scrim-studio/moments/)**：群友可上传短视频、关联多个玩家、按 ID/分类/英雄查找；封面卡片直接链接 B站，观看、点赞和视频评论都在 B站进行。比赛、日期、英雄均为选填，老视频也能上传。网站只保留小尺寸封面和索引，投稿成功、公开验证和本地备份通过并满现有 7 天保留期后释放临时原片。上传口令由群主提供；使用方法、容量限制、部署与回退见 [名场面说明](docs/moments.md)。

## 复盘实验室 · 试用版

新增 [内战复盘实验室](https://3180678503-byte.github.io/lol-scrim-studio/#lab)、[好友全量复盘实验室](https://3180678503-byte.github.io/lol-scrim-studio/friends/#lab) 和 [同队灵排复盘实验室](https://3180678503-byte.github.io/lol-scrim-studio/flex/#lab)。提供同版本、同位置（可限定同英雄）的校准分、最多三个比赛转折、带时间依据的锐评、分阶段输出与经济，并可跳转给同一玩家的同一局打分。原雷达、奖项和共享评论保留。

已保存旧版标签 `pre-review-lab-20261015` 和备份分支。公式、更新方法及保留后续比赛的回退命令见 [复盘实验室说明](docs/review-lab.md)。

## 仓库里有什么

| 文件 / 目录 | 内容 |
| --- | --- |
| `index.html`、`app.js`、CSS | 网站页面、排行、BP、单局复盘、A/B 比赛对比 |
| `data.json`、`data.js` | 已合并的比赛、选手表现、MVP/SVP 和原创锐评 |
| `assets/` | 英雄头像 |
| `flex/` | 独立的好友灵排数据、排行、复盘和规则辅助娱乐锐评 |
| `friends/` | 25 个账号共同去重的全量灵排、各人实际胜负与个人/组队战报 |
| `skills/lol-scrim-update/` | Codex 技能，以及采集、合并、统计和网页构建脚本 |

目前通过更新仓库添加比赛，网站没有直接上传比赛的按钮。看网站不需要 GitHub 账号；更新共享网站需要仓库协作权限。

## 朋友如何添加比赛（推荐使用 Codex）

### 1. 接受协作邀请

仓库拥有者在 **Settings → Collaborators → Add people** 中输入朋友的 GitHub 用户名。朋友接受邀请后，就能向本仓库提交更新。具体操作见 [GitHub 协作者说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)。

每位朋友使用自己的 GitHub 账号登录，不需要仓库拥有者的密码或令牌。

### 2. 在自己的电脑准备客户端和技能

- 使用 Windows，在这台电脑登录英雄联盟，确保需要添加的自定义比赛出现在本人战绩中。
- 在同一台电脑使用 Codex，克隆这个仓库并打开仓库文件夹。已经克隆过则先同步最新版本。
- 安装仓库内的 `skills/lol-scrim-update`：将整个文件夹复制到 `%USERPROFILE%\.codex\skills\lol-scrim-update`，或让 Codex 完成安装。若技能列表尚未刷新，重新打开任务。
- 需要 SGP 的对位位置、详细时间线时，安装并初始化 Akari，使本机存在对应大区的配置。没有 Akari 也可以先读取 LCU；无法确认的位置需要人工补充，缺少的数据会显示空值。

第一次可以直接把下面这段话交给 Codex：

```text
请克隆 https://github.com/3180678503-byte/lol-scrim-studio 到本机，
并安装仓库中的 skills/lol-scrim-update 技能。
这是大家共用的仓库，我已接受协作邀请。
请检查 Git、Python 和我的 GitHub 登录状态；需要网页登录时，使用我的账号授权。
```

### 3. 每次内战结束后，让 Codex 更新

保持游戏客户端已登录，在仓库任务中发送：

```text
使用 $lol-scrim-update 读取我本人最近参与的自定义内战。
先同步这个仓库的最新数据，核对比赛日期和双方阵容，只追加缺少的比赛，保留历史点评。
允许通过本机已登录的 LCU 和 Akari 配置中的对应腾讯大区服务器只读查询战绩；
认证令牌只保存在内存，原始导出放在仓库之外。
更新选手排行、英雄 BP、对位差，并为新增比赛生成 MVP、SVP、胜方最坑、败方最坑，
附具体数据理由、搞笑狠辣的原创赛后锐评和争议备选。
为本次比赛集合生成总评，并支持与历史比赛比较。
检查数据、点评范围和网页后，把脱敏数据及必要网页文件提交并推送到这个仓库的 main 分支。
如果提交前其他人已更新仓库，基于最新数据重新去重合并，不覆盖对方新增比赛，
按比赛 matchKey 重新核对点评对应的编号。
最后确认 GitHub Pages 发布成功，给我公开网站链接和本次新增比赛清单。
```

如果只添加某一天或某几场，在这段话里明确日期或比赛 ID。每位朋友只需登录自己的客户端；共享网站不需要重新部署到各自账号下。

### 4. 确认大家都能看到

推送到 `main` 后，等待 GitHub Pages 构建完成，再打开 [原来的公开网站](https://3180678503-byte.github.io/lol-scrim-studio/)。若看到旧内容，刷新页面。可以核对新增比赛、日期、排行榜和对应锐评。

同一场即使多位朋友都导入，也会按“大区 + 比赛 ID”去重。多人同时更新时，先同步最新数据再合并；不要通过直接覆盖 `data.json` 来解决冲突。锐评需要实际分析，未完成的新增比赛会显示“锐评待生成”。

不使用 Codex 的朋友也可以运行下面的 Python 脚本完成采集和数据合并，再按技能格式补充经过复核的点评。

## 看板功能

- 按比赛日、单局或任意场次集合统计，允许换人、换位与跨日期比赛。
- 选手排行榜：KDA、参团率、DPM、伤害/经济占比、每千金伤害、GD/CSD@15、VSPM。
- 英雄 BP：选取、禁用、出现率、选取胜率，显示实际样本数。
- 单局经济时间线、对位差、资源节点、阵容与已知禁用顺序。
- MVP、SVP、胜方/败方最坑、数据理由、原创赛后锐评及争议候选。
- A/B 两组比赛比较，任意组合，比较同一选手及英雄 BP 的变化。
- [对位雷达](https://3180678503-byte.github.io/lol-scrim-studio/#radar)：参考赛后分析视频的蓝橙双人布局，五个位置可切换，支持单局和所选场次合并。八项轴旁显示真实数值，轮廓按本页全部历史的同位置出场百分位绘制；每死承伤的零死亡分母取 1，合并图按单局指标与单局百分位分别求均值。

雷达八轴从顶部顺时针排列：伤害占比、位置指标 A、经济、位置指标 B、参与击杀、参团率、生存、英雄伤害。按照[参考视频](https://www.bilibili.com/video/BV19kpz64EYW)逐位置核对：

| 位置 | 指标 A | 指标 B | 伤害占比 | A | 经济 | B | 参与击杀 | 参团率 | 生存 | 伤害 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 上单 | 每死承伤 | 补刀 | 10% | 25% | 10% | 10% | 5% | 10% | 20% | 10% |
| 打野 | 每死承伤 | 补刀 | 10% | 15% | 10% | 5% | 15% | 25% | 15% | 5% |
| 中单 | 伤转 | 补刀 | 20% | 20% | 10% | 10% | 10% | 10% | 10% | 10% |
| 射手 | 伤转 | 补刀 | 20% | 20% | 10% | 15% | 10% | 10% | 10% | 5% |
| 辅助 | 每死承伤 | 视野 | 5% | 15% | 5% | 25% | 15% | 20% | 10% | 5% |

位置表现分 = Σ(各轴同位置历史百分位 × 位置权重)。表内权重是本站配置，参考视频没有给出这八个轴的数值权重；配置在 `radar.js` 的 `ROLE_CONFIG`，每行必须合计 100%。它用于雷达页及“表现与评分”的位置表现分。展开网页的“指标、权重与得分明细”即可查看每项权重、百分位、加权贡献和样本数。

伤转 = 对英雄伤害 ÷ 获得金币，以百分比显示；例如视频 G1 中单 Tangyuan 的 22,523 伤害 / 12,235 金币 = 184.1%。每死承伤 = 总承伤 ÷ max(1,死亡数)，生存 = 负阵亡数，参与击杀 = 击杀 + 助攻。辅助视野使用客户端 `visionScore`；视频轴仅标“视野”，没有展示其小数值的转换公式。合并图对单局指标与单局百分位分别取均值；缺项断开连线，位置表现分显示空值并标注有效权重覆盖。

2026-10-11 原始四场的试作海报为 **25 张 1920×1080 PNG**（4 局 × 5 位置，另加四场合并 × 5 位置）：[整套下载](radar-samples/scrim-radars-25.zip)、[G4 射手样张](radar-samples/G4_BOTTOM.png)、[合并打野样张](radar-samples/series_JUNGLE.png)。静态样张保留本次四场快照；网页雷达随数据与筛选更新。网页可下载独立 SVG，离线 HTML 也包含交互雷达。PNG 使用 Matplotlib 根据网页导出的同一模型渲染。

初始数据为 2026-10-11 的四场比赛。新比赛会追加而非覆盖；蓝红为地图侧，不表示永久队伍。锐评是有依据的主观娱乐分析，不是官方评分。集合总评只显示与当前所选比赛完全相同的点评集合。

## 添加好友灵排数据

好友灵排以采集中心账号的已登录客户端为来源：读取本人灵排，按**采集时客户端好友列表**识别本场友方，仅保留本人及同队好友。敌方与陌生队友不进入玩家排行或评奖。好友同队不等于已经证实一起组队。

本次实际读取 230 场灵排，名单修正后其中 226 场有已确认好友同队，涉及本人和 24 位好友，共 1,051 条个人出场记录，日期为 2026-07-02 至 2026-10-12；226 场时间线均已补齐。客户端名单有 79 位好友，只公开其中有同队记录的选手。另 4 场没有已确认好友同队，未入库。

Akari 的“收集模式”使用模式筛选和分页请求组合完成，当前脚本用 `q_440` 筛选灵排，最多扫描 1,000 场；上限不表示服务器一定能返回 1,000 场，也不代表账号终身完整战绩。原始导出保留在私有目录。

后续在 **qwer 已登录客户端的电脑**上，可以发送：

```text
使用 $lol-scrim-update 按 Akari 收集模式读取本人灵排，最多 1000 场。
按当前客户端好友名单识别本人所在队伍，只统计本人和同队好友。
允许只读查询本机 LCU 与 Akari 配置中对应腾讯大区的 SGP；认证令牌只驻留内存。
先同步仓库，向 flex/ 独立数据集追加，保留内战，按比赛 ID 去重并补充时间线。
更新好友排行、逐局好友 MVP/SVP、好友背锅位和原创规则锐评，公开评分依据及限制，
支持任意场次集合总评和 A/B 比较。检查网页后提交推送，验证公开网站的内战与灵排两个入口。
```

手动运行时，在仓库根目录使用：

```powershell
python skills/lol-scrim-update/scripts/collect_flex.py --output ../private-data/flex-YYYYMMDD.json --report ../private-data/flex-report-YYYYMMDD.json --max-games 1000 --timeline-limit 1000
python skills/lol-scrim-update/scripts/merge_flex.py --site flex --input ../private-data/flex-YYYYMMDD.json --scrim-site .
python skills/lol-scrim-update/scripts/review_flex.py --site flex
python skills/lol-scrim-update/scripts/build.py --site flex --resource-root . --html ../好友灵排数据演播室.html --download-icons
git add flex assets skills README.md
git commit -m "Update friend flex matches"
git push origin main
```

Windows 需要 Python 3。每次采集使用新文件名，避免覆盖私有历史；游戏客户端若以管理员身份运行，采集助手可能也需要相同权限才能读取其本机连接信息。不要把连接信息、令牌或进程命令行贴到群里或提交到 GitHub。

**朋友自己的灵排请使用另一个独立数据集。** 共享 `flex/` 当前以 qwer 的队伍和胜负为中心；不要在自己的账号下采集后直接覆盖这里。朋友添加大家的自定义内战仍按上面的协作步骤完成。若要新增另一个人的灵排页面，让 Codex 建立独立目录和导航入口，保持采集中心与好友名单清楚。

### 查询指定好友各自的灵排并合并

`friends/` 是多账号入口。此次选取原来与 qwer 同队过的 24 位好友，加本人共 25 个账号，各自最多扫描 1,000 条记录，实际返回 **4,395 条名单账号灵排记录**。按“大区 + 比赛 ID”合并后为 **1,544 场、6,100 条个人出场记录**，日期 **2025-10-13 至 2026-10-13**。

其中 **743 场本人未参与**；合并后识别出 **801 场本人出场**。本人单独查询只返回 230 场，而其他好友的查询补出了共同比赛，所以“接口返回场数”与“合并后出场数”会不同。两种数字在页面数据口径中分别展示。每位好友的同一局个人数据只计一次，不按查询来源重复加分。

此次 **1,544 场时间线全部补齐**，可查看真实 10/15 分钟对位指标和逐局经济走势。对应分钟不足或位置无法唯一匹配时，差值留空并显示实际样本数。

按个人所在队伍统计胜负、参团与占比。只有一位名单选手的场次显示个人战报；同侧有两位以上名单选手时，才比较好友 MVP/SVP 与搭车/背锅。本人未参与的比赛不会算成本人的胜局或败局。三个入口分别为内战、本人好友同队、多账号好友全量，可分别比较。

后续可以直接交给 Codex：

```text
使用 $lol-scrim-update 更新 friends/ 的好友全量灵排。
按这个数据集 cohort 名单查询这 24 位好友和本人各自的战绩，最多每人 1000 条。
通过当前登录客户端只读查询 LCU 与对应腾讯 SGP，匹配私有身份处理历史改名。
复用私有时间线缓存，合并同一场比赛，只统计名单中的选手。
保留内战和 flex/；更新 friends/ 的排行、锐评、选手/好友组队筛选和比赛比较，
检查后推送并验证三个公开入口。
```

手动采集需要先在本机用已登录客户端读取 `current-summoner` 和好友名单，生成仓库外的私有 roster：`{"self":<本人原始对象>,"selected":[<选中的好友原始对象>]}`。身份与认证信息留在本机；已有确认过的 roster 可以复用。命令如下：

```powershell
python skills/lol-scrim-update/scripts/collect_friends_flex.py --roster ../private-data/friend-roster.json --output ../private-data/cohort-YYYYMMDD.json --report ../private-data/cohort-report-YYYYMMDD.json --timeline-cache ../private-data/cohort-timelines --max-per-account 1000 --workers 4
python skills/lol-scrim-update/scripts/merge_friends_flex.py --site friends --input ../private-data/cohort-YYYYMMDD.json --report ../private-data/cohort-report-YYYYMMDD.json
python skills/lol-scrim-update/scripts/review_flex.py --site friends
python skills/lol-scrim-update/scripts/build.py --site friends --resource-root . --html ../好友全量灵排演播室.html --download-icons
git add friends assets skills README.md
git commit -m "Update friend cohort flex records"
git push origin main
```

`--reuse <旧本人灵排私有导出>` 可复用最初的时间线。每次新增采集使用新日期文件名；同次中断时可以复用该次已核对的账号摘要缓存。若要更改名单，先核对 `cohort` 与私有身份映射，再合并，避免把同名不同人混在一起。完整说明见 [多账号采集技能](skills/lol-scrim-update/references/flex-collection.md)。

灵排评分按同位置样本的指标百分位加权：辅助重视参团、视野和控制；缺少 15 分钟帧时不造数。每局只评好友最高分（胜局 MVP / 败局 SVP）和好友最低分位；集合总评按所选场次重新计算，最低门槛 5 场，短集合按其实际场数。页面列出具体权重、证据和备选。**这是规则辅助娱乐评选，未逐场审核回放，也不是官方 MVP；最低分不等于证明输赢责任。** 锐评为原创规则文案，不是论坛网友原文。详细规则见 [好友灵排技能说明](skills/lol-scrim-update/references/flex-collection.md)。

## 手动更新：脚本与命令

仓库包含可复用 Codex 技能 `skills/lol-scrim-update`。复制该文件夹到你的 `~/.codex/skills/`，即可调用：

> 使用 $lol-scrim-update 读取今天新的自定义内战，合并到这个网站，更新每局 MVP、SVP、两队背锅和锐评，并比较今天与上次的比赛，最后更新 GitHub Pages。

本机英雄联盟须已登录。采集脚本仅支持 Windows 本机客户端；合并、统计与网页构建使用 Python 标准库，其他系统也可运行。无需把令牌放进网站。

```powershell
# 在仓库根目录运行；原始文件放在仓库之外，不会发布。
python skills/lol-scrim-update/scripts/collect.py --output ../private-data/matches-2026-10-13.json --history-count 60 --max-games 20 --allow-sgp
python skills/lol-scrim-update/scripts/merge.py --site . --input ../private-data/matches-2026-10-13.json
python skills/lol-scrim-update/scripts/report.py --site . --output ../private-data/review-evidence.json
# 根据 report 生成并复核原创点评 JSON，可由 Codex 技能完成。
python skills/lol-scrim-update/scripts/merge.py --site . --awards ../private-data/reviews-2026-10-13.json
python skills/lol-scrim-update/scripts/build.py --site . --html ../内战数据演播室.html
git add index.html app.js styles.css awards.css extension.css data.json data.js assets skills README.md
git commit -m "Add reviewed scrim matches"
git push origin main
```

`--allow-sgp` 使用当前登录令牌向 Akari 本机配置中的实际腾讯大区读取比赛摘要和时间线；默认只读 LCU。缺少明确位置时用 `--roles` 人工确认，详见技能 references。不能拿最后一帧当成不存在的 15 分钟数据。

合并以“大区 + 比赛 ID”去重，不降级已有详细时间线；旧点评保留。新增英雄如缺图标，构建会报告 ID，可使用 `build.py --download-icons` 获取公开英雄图标。不生成完整选人先后、官方评分或未经验证的单杀数据。

## 好友灵排雷达与同位置对比

- [好友全量雷达](https://3180678503-byte.github.io/lol-scrim-studio/friends/#radar)：使用每位好友自己的灵排，包含本人未参与的比赛。
- [同队好友雷达](https://3180678503-byte.github.io/lol-scrim-studio/flex/#radar)：使用原有本人战绩中的好友同队记录。

本人 qwer 与已确认好友均可在雷达选择器中找到。仓库 `roster-policy.json` 持续排除已移出名单的成员；merge/review 自动应用规则，旧数据再次导入也不会恢复。

进入“好友雷达”，选择位置与好友 A 即可查看单人图。将模式切为“两位好友对比”，再选择好友 B，可以叠图、交换 A/B、查看原始均值与差值、各项权重贡献并下载 SVG。下方按玩家分类的表格可直接打开个人图或与 A 对比。两人分别显示本位置场数、胜率、常用英雄与最近一场锐评；只取已确认位置的好友记录，本人 qwer 参与雷达及参照池。

顶部日期、自选比赛、包含选手及好友组队条件（如有）共同限定统计范围。每人只汇总所选位置出场，跨蓝红侧按个人合并，两人可以来自不同比赛。参照池固定为当前数据集全部历史的同位置名单选手出场；日期筛选只改变个人汇总，保持两人使用同一基准。伤转等指标先逐局计算再平均，轮廓平均每局百分位，位置表现分使用上文五位置权重。有效样本逐项显示，少于 5 场会提示样本数，完整缺失指标不生成位置表现分。

`friend-radar.js` 为两套灵排共用模块，复用 `radar.js` 的指标、权重和 SVG，不从网页查询游戏客户端。以后更新对应 `data.json` 并构建后，好友、位置和雷达自动更新。离线 HTML 内嵌相同模块。可运行 `node tests/friend-radar.test.cjs` 验证按位置取数、平均比率、共有基准、本人排除及缺项处理。

## 数据与部署

「峡谷名场面」支持群友上传视频、关联多个玩家并筛选，比赛关联选填。视频观看、点赞和评论在 B站进行，目录浏览只加载同站封面与索引。可勾选公开发布授权，由群主电脑上的程序统一投稿 B站；群友无需登录 B站。投稿会把网站分类、英雄和相关玩家 ID 加入标签，并在简介保留完整信息。已创建「名场面、下饭操作、默契配合、整活现场」四个空间视频列表（B站称「系列」），审核通过后按网站分类自动归档。首次扫码、本机自动任务、标签规则、旧视频搬运、原片保留和异常恢复见[自动转存 B站说明](docs/moments-bilibili.md)。

网站 `data.json` 与 `data.js` 是脱敏的公开分析数据，只包含游戏昵称、比赛表现及公开对局标识。原始战绩、PUUID、账号标识、本机密码、登录令牌不应放进仓库。构建会检查敏感字段与比赛去重/击杀合计。

GitHub Pages 使用 `main` 分支根目录 `/`，`.nojekyll` 禁用 Jekyll，不需要构建 Actions。更新推送后等待 Pages 构建完成。朋友打开公开链接即可使用；也可以发送构建生成的单文件 HTML，双击即可离线查看。

统计口径、接口、锐评字段见 [技能说明](skills/lol-scrim-update/SKILL.md)。

## 群友五星评分和群聊日报

本机已配置每天北京时间 04:00 的 Windows 灵排同步流程：需要时启动 WeGame 和英雄联盟，更新好友全量及本人同队两套数据、排行、雷达、锐评和日报/周报，并发布 GitHub Pages。采集完成后提醒两分钟，可取消关闭；无人操作则结束已核对的客户端。运行条件、日志和手动命令见[每日灵排同步](docs/daily-flex-sync.md)。

三个入口均有“表现与评分”：选择玩家、日期，再切换“单局表现”或“当天表现”，左侧查看雷达、具体数据和已有锐评，右侧选择自己的 ID、打 1～5 星或写评论。朋友无需额外账号，其他设备可查看共享评价；再次打星更新该 ID 原评分。

当天按北京时间 04:00 到次日 04:00 归组，包含该玩家当天全部位置的已入库出场。位置页签只切换雷达，全天星级仍评价完整一天。逐局表的“查看并评价这局”同步切换雷达与评分对象，“返回这一天的整体表现”回到全天。同位置好友可叠图比较，评分对象始终保持为选中的玩家。

地址栏会保存所选玩家、日期、评价范围与雷达位置，复制当前网址即可分享同一面板。原“好友雷达 / 对位雷达”入口保留任意场次和双人对比。`performance.js` 共用三套数据的个人面板，`community.js` 连接现有评分接口；位置表现分（0–100）和群友星级（1–5）分别展示，已有评论与评分对象沿用。

两套灵排有“日报 / 周报”，支持群聊简版、完整面板、按玩家选择、复制文字、下载 TXT/JSON。日报为北京时间 04:00 到次日 04:00，周报为周一 04:00 到下周一 04:00；按对局开始时间归属。

已接入 GPT 的机器人可读取[好友全量日报纯数据](friends/reports/latest-daily.bot.json)、[周报纯数据](friends/reports/latest-weekly.bot.json)，配合[点评提示词](friends/reports/bot-prompt.txt)生成群聊战报。数据含全期、分位置汇总和逐场英雄/战绩，不预先写评语。也保留[日报 TXT](friends/reports/latest-daily.txt)、[周报 TXT](friends/reports/latest-weekly.txt)；普通 `.json` 包含纯数据文字 text 与每段最多 1800 字的 segments。latest 指向最新有数据且已结束的周期，当前周期使用 current 链接。

朋友操作、API 存储、全部机器人链接、更新命令和测试见[评分与报表说明](docs/community-and-reports.md)。新增数据后运行 `node tools/build-community-manifest.cjs` 和 `node tools/export-flex-reports.cjs` 再构建、发布。

## 国内入口迁移

已提供可迁移的 Node.js 24 + SQLite 服务，网站、上传和比赛评分使用同一域名，封面目录由本地数据库生成。迁移步骤见 [国内部署说明](server/DEPLOY.md)。打包命令：`python tools/package-domestic-site.py --output <部署包.zip>`。部署包不含视频、数据库备份或密钥。现有 GitHub Pages 保持可用，新的国内入口需完成云资源与域名设置后上线。
