# 内战数据演播室

英雄联盟国服自定义内战的公开复盘看板。无需登录、无需后端，可在 GitHub Pages 或本地直接打开。

**公开网站：[内战数据演播室](https://3180678503-byte.github.io/lol-scrim-studio/)**

## 仓库里有什么

| 文件 / 目录 | 内容 |
| --- | --- |
| `index.html`、`app.js`、CSS | 网站页面、排行、BP、单局复盘、A/B 比赛对比 |
| `data.json`、`data.js` | 已合并的比赛、选手表现、MVP/SVP 和原创锐评 |
| `assets/` | 英雄头像 |
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

初始数据为 2026-10-11 的四场比赛。新比赛会追加而非覆盖；蓝红为地图侧，不表示永久队伍。锐评是有依据的主观娱乐分析，不是官方评分。集合总评只显示与当前所选比赛完全相同的点评集合。

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

## 数据与部署

网站 `data.json` 与 `data.js` 是脱敏的公开分析数据，只包含游戏昵称、比赛表现及公开对局标识。原始战绩、PUUID、账号标识、本机密码、登录令牌不应放进仓库。构建会检查敏感字段与比赛去重/击杀合计。

GitHub Pages 使用 `main` 分支根目录 `/`，`.nojekyll` 禁用 Jekyll，不需要构建 Actions。更新推送后等待 Pages 构建完成。朋友打开公开链接即可使用；也可以发送构建生成的单文件 HTML，双击即可离线查看。

统计口径、接口、锐评字段见 [技能说明](skills/lol-scrim-update/SKILL.md)。
