# 内战数据演播室

英雄联盟国服自定义内战的公开复盘看板。无需登录、无需后端，可在 GitHub Pages 或本地直接打开。

**公开网站：[内战数据演播室](https://3180678503-byte.github.io/lol-scrim-studio/)**

## 看板功能

- 按比赛日、单局或任意场次集合统计，允许换人、换位与跨日期比赛。
- 选手排行榜：KDA、参团率、DPM、伤害/经济占比、每千金伤害、GD/CSD@15、VSPM。
- 英雄 BP：选取、禁用、出现率、选取胜率，显示实际样本数。
- 单局经济时间线、对位差、资源节点、阵容与已知禁用顺序。
- MVP、SVP、胜方/败方最坑、数据理由、原创赛后锐评及争议候选。
- A/B 两组比赛比较，任意组合，比较同一选手及英雄 BP 的变化。

初始数据为 2026-10-11 的四场比赛。新比赛会追加而非覆盖；蓝红为地图侧，不表示永久队伍。锐评是有依据的主观娱乐分析，不是官方评分。集合总评只显示与当前所选比赛完全相同的点评集合。

## 以后怎么更新

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
