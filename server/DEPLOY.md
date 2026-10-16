# 国内部署包

本站采用「网站封面目录 + B站视频与互动」。网站保留上传、ID/英雄/分类筛选、比赛统计、雷达图和比赛评分。视频观看、点赞与视频评论直接前往 B站。

## 当前上线需要的资源

需要可运行 Node.js 24 或 Docker 的托管服务，以及 HTTPS 域名。使用腾讯云中国大陆节点时，准备实名认证和已备案域名；腾讯云静态托管默认域名仅供开发测试。当前包已在本机验证，尚未部署到新的国内托管账号。

参考：[腾讯云静态托管](https://cloud.tencent.com/document/product/876/46900)、[HTTP 访问服务与域名](https://cloud.tencent.com/document/product/876/130728)。购买服务前确认具体套餐、域名和备案要求。

## 包内结构

- `app/public/`：公开网页、比赛数据、封面目录；不含 MP4。
- `app/backend/`：复用的比赛评分、上传和投稿队列接口。
- `app/server/serve.mjs`：Node HTTP、SQLite 数据库和临时文件存储。
- `Dockerfile`、`compose.yaml`、`Caddyfile`：应用和 HTTPS 入口。
- `.env.example`：空白配置。实际密钥和数据库备份另行私下迁移。

## 正式迁移

1. 在原服务做最后一次备份：D1 SQL 导出，以及封面/尚未转存的原片。备份包含管理信息，只放私有目录。先校验新服务导入，切换期间暂停新提交，避免两边各写一份。
2. 解压部署包，复制 `.env.example` 为 `.env`，填写域名及原服务的四个密钥。密钥继续使用原值，以便保留原上传者管理凭证。
3. 把数据库 SQL 放到 `data/import.sql`；封面放到 `data/media/posters/<UUID>.jpg`，尚需暂存的原片放到 `data/media/videos/<UUID>.mp4`。仅全新 SQLite 文件首次启动时导入 SQL，重启不会重复导入。
4. 域名解析到新服务，开放 80/443。运行 `docker compose up -d --build`。Caddy 提供 HTTPS。数据库、封面和临时视频保存在 `data/`，更新应用时保留此目录。
5. 新服务自动将前端配置改成同域 `/api/community` 与 `/api/moments`，目录、封面与 API 都走新域名。页面读取 `/moments/catalog.json` 时从本地数据库生成最新目录，不依赖 GitHub 或 Cloudflare。
6. 本机 B站同步配置的 `workerUrl` 改为 `https://<域名>/api/moments`，`archiveKey` 保持一致。先只读核对、再启用原定时任务。已投稿的视频沿用原 BV，不重复上传。
7. 验收后解除提交暂停，更新分享入口；保留旧网站和备份用于回退。

## 验收

关闭浏览器代理后，用手机流量和常用宽带分别检查首页、雷达、比赛评分、新片上传、按 ID/英雄筛选、B站跳转。核对既有比赛/评分/视频数量、原评论备份、投稿队列和本地备份。域名、证书、服务实际区域和国内线路需要在新托管就绪后验证。

本地验证命令：`node tests/domestic-host.test.mjs`、`node tests/moments-directory.test.cjs`。Docker 镜像与公网 HTTPS 尚需在目标服务器上验证。
