# 赛事预测

入口：[群友解说席](https://3180678503-byte.github.io/lol-scrim-studio/predictions/)。三套数据演播室导航也有“赛事预测”。

## 朋友怎么参加

1. 选择自己的游戏 ID，找到对应比赛。
2. BO1 选择胜者；BO3 / BO5 再选择比分，点击“提交预测”。
3. 开赛前五分钟可以在原浏览器修改。浏览器自动保存随机编辑凭据；换设备或清空网站数据后，无法修改原浏览器提交的票。
4. 封盘后可以查看大家的选择。官方确认赛果后，“群友排行榜”自动更新；可按赛事、北京时间日期、阶段筛选。

身份沿用群友自报 ID。随机编辑凭据保护已提交的预测，不能证明首次署名者就是该玩家；请勿冒用他人 ID。赛前 API 不返回其他人的票，也不接受仅凭 ID 覆盖原票。无需注册新账号。

## 规则

- 同一官方比赛 + 同一 ID 只有一票。修改覆盖原票，重试不重复记分。
- 服务器以官方开赛时间提前五分钟封盘；官方提前开始也会封盘。锁定截止时间只会提前，延赛不会重新开放。
- 排名依次比较：胜者命中场数、BO3 / BO5 精确比分命中数、胜者命中率；三项相同并列。BO1 不加精确比分；只将有效且已结算的参与场次计入分母。
- 对手或 BO 赛制变化，旧票作废；未封盘可在原浏览器重新预测。比赛取消不计分。完赛但缺合法胜负或比分，等待官方补齐。官方更正比分后立即重算，采用查询时计算而非累加分数。
- 日期为北京时间自然日，不使用灵排日报的 04:00 换日规则。

## 数据与部署

全部对阵、时间、赛制和比分来自 [拳头官方 Worlds 页面](https://lolesports.com/en-US/leagues/worlds)。后端只解析页面序列化的 Apollo JSON 数据，不执行网页脚本，不使用第三方战绩网站。

`backend/predictions-source.mjs` 为官方数据读取器，`backend/predictions.mjs` 处理同步、封盘和排行。复用现有 Cloudflare Worker 与 D1，与评分、内战和灵排表隔离。云端 Cron 每两分钟触发，赛前一小时及赛中约两分钟同步一次，其余时间约八分钟同步。电脑关闭仍会执行。最近成功同步超过十分钟时暂停新预测，保留历史数据和查询。

初次部署在现有数据库执行增量 SQL，再部署含 Cron 的 Worker（实际 D1 绑定放在被忽略的 `wrangler.deploy.jsonc`）：

```sh
wrangler d1 execute lol-scrim-community --remote --config backend/wrangler.deploy.jsonc --file backend/predictions.sql
wrangler deploy --config backend/wrangler.deploy.jsonc
```

`GET /predictions?season=2026&day=2026-10-24&stage=Swiss&member=<名单key>` 返回赛程、名单、锁盘后的公开选票与排行榜。浏览器通过 `X-Prediction-Key` 请求头携带私有编辑凭据，才能读到自己的未公开票。`POST /predictions` 提交 `{eventId,memberKey,signature,winnerId,loserWins}`；BO1 的 `loserWins` 为 0。

只读接口不含编辑凭据或其摘要。不要把编辑凭据写到网址、日志或公开文件。好友名单沿用公开 `backend/manifest.json`，后台约一分钟同步名单变化。

## 验证

```sh
node tests/predictions.test.mjs
node tests/community.test.mjs
node tests/predictions.browser.mjs
```

浏览器测试需要 Playwright，可用 `PLAYWRIGHT_MODULE` 指向本地已安装模块、`EDGE_PATH` 指向 Edge。测试在内存 SQLite 和本机 HTTP 服务中运行，包括两浏览器提交/隐藏/结算，不会向线上写入模拟比赛或预测。

回退前端可回退该功能提交；回退 Worker 用 Cloudflare 历史版本。预测表为新增表，回退时保留表即可，不影响原有评分和评论。
