# 评选与发布

逐局 MVP 从胜方选、SVP 从败方选；背锅位各侧一人，禁止只按死亡数机械选择。结合职责、同位置对线、资源份额、输出、参团、承伤、控制、视野与关键事件。辅助和坦克不套射手的输出标准；胜方“最坑”可解释为相对薄弱、瑕疵最多，不意味着毫无贡献。

原始数据没有官方 MVP 分数。排行榜是客观指标排序，奖项是有证据的主观娱乐评选。不得把“最后击杀者”说成单杀；有助攻的死亡不计为单杀。不用比赛时间外的生活、身份、健康、人身攻击编梗。可写“经济吃得像主角，输出交得像群演”等原创游戏吐槽，不抄网友原文，不伪造虎扑评分。

锐评文件：`{"matches":{"HN1:123":[四条记录]},"collections":[{"label":"周末四场总评","matchKeys":["HN1:123",...],"records":[四条记录],"dailyComments":[]}]}`。
每条记录必需 category(mvp/svp/winWorst/loseWorst)、key、name、team、championId(总评可 null)、title、reason、roast、alternative、scope(all/wins/losses)、matchNumbers、stats。stats 来自 report 的对应范围，含 games/kills/deaths/assists/dpm/kp/gd15 等。比赛集合总 MVP 统计全部选定比赛；总 SVP 只统计其败局；总背锅分别只统计其赢局/败局。精确集合点评只在同一集合显示；用户换组合后不能借用旧总评。

GitHub 发布：先确认当前仓库 remote 与登录账号；新网站建 public 仓库，静态文件在 main 根、`.nojekyll` 存在。用仓库自己的 GitHub Pages 设置（source main /），无需 Sites，也无需前端存令牌。GitHub 尚未授权时使用 `gh auth login --web` 设备流程，请用户在自己的浏览器输入短码；不让用户发密码/token。不要把旧私有站点的 `.openai` 或 Git 元数据复制进新仓库。

提交网站、脱敏 data.json/data.js、技能源码和用法；忽略 `private-data/`、raw 导出、.env、日志、认证缓存。构建脚本同时输出单文件 HTML，便于离线分享。发布授权来自当前用户意图；仅更新本地数据的请求不自动推送外部站点。

GitHub Pages API（参考 https://docs.github.com/en/rest/pages/pages ）：创建 source 为 `{branch:"main",path:"/"}`；轮询 build 以合理间隔等待（不要高频请求），匿名 GET 验证 `https://<owner>.github.io/<repo>/` 与相对资源。国内朋友是否能连接 GitHub Pages取决于网络；HTML 分享文件作为补充，不声称所有网络均可访问。
