# 复盘实验室 · 试用版 01

入口：内战、你的好友灵排、好友全量灵排页面的「复盘实验室」，或在页面地址后添加 `#lab`。

## 当前功能

- 按比赛、玩家选择表现；支持分享当前比赛与选手的链接。
- 校准复盘分与原版八轴位置分并列，展开可查看实值、权重、百分位、有效样本和贡献。
- 经济曲线上标记最多三个转折；点击事件依据定位到附近真实经济帧。
- 赛后锐评引用击杀、终结赏金、资源、真实 15 分钟对位数据。
- 从分钟帧累计伤害与经济计算阶段分均表现，显示实际时间区间。
- 点击「给这局打分」进入同一位玩家、同一场比赛的原有共享评分；评分面板也显示校准数据与事件摘要。

## 校准公式 v1

参照只使用当前独立数据集内，同主要版本（如 `16.20`）、同位置的历史出场；可进一步限定同英雄。排除被评价的本次出场，去重比赛，不随页面日期筛选改变参照池。

每项至少需要 5 条其他有效出场。百分位 = `(小于本局的样本数 + 同值样本数 / 2) / 有效样本数 × 100`；每 10 分钟阵亡数反向计分。完整分 = `Σ(百分位 × 该项权重 / 100)`。缺少任意指标时，完整分为空，仍展示实值和有效权重。参照场数为出场数，可包含同一位选手的不同场次。

| 位置 | 指标与权重 |
| --- | --- |
| 上单 | GD15 25%、XPD15 10%、DPM 20%、参团 15%、分均视野 10%、每10分钟阵亡 20% |
| 打野 | GD15 15%、DPM 15%、参团 30%、分均视野 20%、每10分钟阵亡 20% |
| 中单 | GD15 20%、XPD15 10%、DPM 30%、参团 20%、每10分钟阵亡 20% |
| 射手 | GD15 20%、分均补刀 20%、DPM 35%、参团 10%、每10分钟阵亡 15% |
| 辅助 | 参团 35%、分均视野 35%、分均控制时长 20%、每10分钟阵亡 10% |

权重为本站配置。原版雷达、原规则分和原奖项继续使用各自公式。

## 转折与事件口径

优先选约 2 分钟（90–150 秒）内，绝对金币差净变化最大的三个互不重叠窗口；不足三个时补入大龙、小龙、厄塔汗等资源事件。跨度内事件按实际记录展示。经济变化至少 200 金币才进入候选，时间线不足时显示实际能找到的数量。

「参与击杀后拿资源」要求本人击杀或助攻，随后 90 秒本队拿资源。「阵亡后丢资源」要求随后 60 秒敌方拿到关键史诗资源。这些描述表示事件先后。来源中的击杀事件条数与赛后击杀次数分别显示；不相等时保留两者原值。

个人阶段以 0、15、25 分钟分段；边界取距目标最多 5 秒的真实帧，末段结束于最后可用帧。累计值缺失时保留空值。插眼位置、逐技能命中率未作为本版指标。

## 后续添加比赛

`merge.py`、`merge_flex.py`、`merge_friends_flex.py` 已接入 `review_timeline.py`。今后的常规导入和凌晨采集会自动补充证据；重复导入保留更完整的证据。公开投影仅包含允许字段，个人阶段只保留当前名单选手，陌生人的事件引用匿名化。

已有公开比赛可从私有缓存补充，无需登录客户端：

```powershell
python tools/enrich-review-timelines.py --cache <私有timeline缓存目录> --summaries <私有cohort导出.json>
python skills/lol-scrim-update/scripts/build.py --site .
python skills/lol-scrim-update/scripts/build.py --site friends --resource-root .
python skills/lol-scrim-update/scripts/build.py --site flex --resource-root .
```

内战旧导出可加 `--custom-export <旧内战导出.json> --sgp-export <旧SGP导出.json>`。私有文件放在仓库之外。`build.py --html <输出路径>` 继续支持内嵌实验室的离线 HTML。

## 回退

试用前稳定版本：`198c6412067f5b6fe5fe593f6cca9b7382b01325`。

- 标签：`pre-review-lab-20261015`
- 分支：`backup/before-review-lab-20261015`
- 本机另留完整 Git bundle 和源码 ZIP；二者均不包含私有采集缓存。

推荐恢复旧界面，同时保留后续新增的比赛、评论和日报：

```powershell
git restore --source=pre-review-lab-20261015 -- index.html app.js performance.js friends/index.html friends/friends.js flex/index.html flex/flex.js
git add -- index.html app.js performance.js friends/index.html friends/friends.js flex/index.html flex/flex.js
git commit -m "Restore previous dashboard interface"
git push origin main
```

新增的证据字段与旧页面兼容，Cloudflare 的评论数据库不受界面回退影响。若仅查看完整旧版，可以下载该标签的源码 ZIP，在独立目录打开 `index.html`。

## 验证

```powershell
node --test tests/review-core.test.cjs tests/performance.test.cjs tests/friend-radar.test.cjs tests/reports.test.cjs
python -m unittest discover -s tests -p test_review_timeline.py
python -m unittest discover -s tests -p test_daily_collection.py
python skills/lol-scrim-update/scripts/test_roster_policy.py
```
