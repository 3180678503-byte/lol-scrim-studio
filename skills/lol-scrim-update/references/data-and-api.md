# 接口与公共数据

已验证来源：LeagueAkari v1.5.1 的 SGP match-history-query 实现：https://github.com/LeagueAkari/LeagueAkari/blob/v1.5.1/src/shared/http-api-axios-helper/sgp/match-history-query.ts 。接口可能变化；失败时核对本机配置与官方项目源码，勿反复盲试。

LCU 在本机 HTTPS 端口运行。凭证从 LeagueClientUx/LeagueClient 进程参数提取，必要时读取其安装目录 lockfile，Basic `riot:<本机密码>`。仅本机允许自签名证书；腾讯请求使用正常证书验证，不跟随重定向。令牌只在内存，不打印命令行或完整认证响应。

GET 端点：`/lol-summoner/v1/current-summoner`、`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19`、`/lol-match-history/v1/games/{id}`、`/lol-match-history/v1/game-timelines/{id}`、`/lol-game-data/assets/v1/champion-summary.json`、`/entitlements/v1/token`。

Akari 配置通常在 `%APPDATA%/league-akari/AkariConfig/akari-api-main/config/v1/sgp/league-servers.json`；从 `servers.TENCENT_<platformId>.matchHistory` 取对应目的地。不要把艾欧尼亚 HN1 当作所有账号的大区。

SGP 使用 entitlements 的 accessToken：
- `/match-history-query/v1/products/lol/player/{puuid}/SUMMARY?startIndex=0&count=20`
- `/match-history-query/v1/products/lol/{platformId}_{gameId}/SUMMARY`
- `/match-history-query/v1/products/lol/{platformId}_{gameId}/DETAILS`

DETAILS 返回 `frames`。SUMMARY 的参与者通常是扁平 stats，LCU 的 stats 通常嵌套。旧四场 SUMMARY 提供了可靠 teamPosition；旧 G4 DETAILS 比 LCU 的事件丰富。`stats/endOfGame` 曾返回 503，不是必需接口。游戏 BP 最终阵容和 `pickTurn` bans 可读，完整选人先后不可恢复。

公共 schema v2：根包含 champions、matches、sessions、awards、sampleSize；每场 `matchKey=platformId:id`、稳定 number、createdAt、date、sessionId、duration、winner、teams、players、frames、events、timelineSource。players 使用游戏昵称与 tag 为 key，不使用 PUUID。每场五人每侧，`role` 在 TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY/UNKNOWN 中。人工位置 JSON：`{"HN1:123":{"玩家名#tag":"TOP"}}`，也支持 participantId 字符串。

KDA 累加 K/A/D 后求比，无死亡标“完美”。KP 累加 K+A / 累加所在队伍击杀；DPM、CSPM、VSPM 均以合计比赛分钟为分母。伤害/金币占比以对应队伍合计为分母；零分母为空。GD/CSD/XPD@15 同场同位置差，跨场只平均非空值，并给出有效场数。15 分钟帧需比赛已满 900 秒且与目标相差不超过 5 秒；10 分钟同理。BP 出现率以出现过该英雄（选或禁）的去重比赛数为分子，未登场英雄胜率为空。

merge 支持本技能 collect 导出和旧 `{matches:[{detail,timeline}]}` 格式。旧独立 SGP 样本用 `--sgp` 导入。公共网站只接受结构化允许字段，原始 account、participantIdentities、accessToken 不公开。
