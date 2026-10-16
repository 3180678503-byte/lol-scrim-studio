# 免费国内入口核对（2026-10-16）

当前视频页已改成封面与 B站链接目录，浏览和筛选只读取同站文件；视频观看、点赞和视频评论在 B站进行。上传与比赛评分仍需后端。新的国内公网入口尚未开通。

## 首选试用候选：腾讯云 CloudBase

[官方价格文档](https://cloud.tencent.cn/document/product/876/75213)列出：每账号可创建一个免费体验环境，每月 3000 资源点，单次可续期 6 个月，不自动续期；免费环境不支持资源包与按量付费，手动升级后才进入付费环境。

[静态托管说明](https://cloud.tencent.com/document/product/876/46900)明确 `*.tcloudbaseapp.com` 默认域名只用于开发测试，并有限频；[HTTP 服务说明](https://cloud.tencent.com/document/product/876/130728)也有默认域名限制，正式生产建议使用备案自定义域名。因此先做小范围直连测试，不能把免费测试域名当成正式入口的保证。

续期细则需要查看账号实际控制台：[官方续期说明](https://cloudbase.cloud.tencent.com/blog/2026/07/28/cloudbase-free-trial-renewal)包含分享内容并提交链接/截图的续期任务。系统不会替用户发布推广内容。

下一步需要：用户登录腾讯云并完成必要的实名认证，检查账号免费资格、默认域名、静态托管与后端额度。先上传不含密钥的轻量目录，用手机流量/宽带测试。免费环境的后端运行与文件上传限制需在账号中确认后再适配，当前 Node + SQLite 部署包用于有持久磁盘的 Node/Docker 托管，不能直接当作云函数部署。

## 腾讯 EdgeOne Pages

[官方域名说明](https://edgeone.cloud.tencent.com/pages/document/162936836982489088)明确：包含中国大陆的项目默认预览链接只有 3 小时；排除中国大陆的默认域名从大陆访问会返回 401。自定义域名才能建立长期入口，使用大陆节点还需备案。因此不选默认域名作为群友长期分享入口。

## 阿里云 ESA

[免费套餐](https://help.aliyun.com/zh/edge-security-acceleration/esa/product-overview/free-plan)可 0 元购买/续费，但定位个人开发与功能评估，不承诺 SLA；[计费说明](https://www.alibabacloud.com/help/zh/edge-security-acceleration/esa/product-overview/billing-overview/)把「函数和 Pages」「边缘存储」列为单独增值项。不能据「ESA 免费」推断完整上传后端与 Pages 永久免费。账号内的默认域名、额度和大陆访问效果仍需核对。

## 本次已准备

- 封面目录与自动更新：`moments/catalog.json`、`moments/covers/`，现有三张封面约 95KB。
- 国内迁移服务：同域上传/评分 API、SQLite 与文件暂存，已有真实数据库恢复验证。
- 公共部署包生成器：`python tools/package-domestic-site.py --output <部署包.zip>`。密钥、数据库导出和 MP4 另行保存在私有目录。
- 原 R2 暂存继续使用既有 7 天规则；本次不提前删除视频。
