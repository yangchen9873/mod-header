# mod-header

在浏览器工具栏一键为**所有请求**添加、修改或移除自定义请求头。基于 Chrome MV3 的 `declarativeNetRequest` 实现，无需代理即可在请求发出前改写请求头。

## 功能

| 功能 | 说明 |
| --- | --- |
| 添加 / 覆盖请求头 | 输入名称与值即可对所有匹配请求注入该请求头 |
| 移除请求头 | 仅填写名称、留空值，表示在请求时移除该请求头 |
| 启用 / 禁用 | 通过开关临时停用某个请求头，无需删除 |
| 一键删除 | 从列表移除某个请求头及其 DNR 规则 |
| 实时生效 | 配置变更后自动同步 `declarativeNetRequest` 动态规则 |

## 安装

1. 打开扩展管理页：Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`。
2. 开启「开发人员模式」。
3. 选择「加载解压缩的扩展」，并选择本项目目录。
4. 点击工具栏图标，开始添加请求头。

## 工作原理

扩展在弹出页中维护一份自定义请求头配置（`name -> { value, enabled }`），并持久化到 `chrome.storage.local`。每次配置变更时，根据启用项重建 `declarativeNetRequest` 的 **动态规则**：

- 有值 → `operation: set`，在请求中写入 / 覆盖该请求头；
- 无值 → `operation: remove`，在请求中移除该请求头。

规则匹配所有 URL 与常见资源类型，因此在请求到达服务器前即可完成改写，无需任何后台常驻脚本。

## 目录结构

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | 扩展清单（权限与图标） |
| `popup.html` | 弹出页结构 |
| `popup.js` | 弹出页逻辑、配置管理与 DNR 规则同步 |
| `popup.css` | 弹出页样式 |
| `icons/` | 应用图标 |

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `declarativeNetRequest` | 拦截并改写请求头 |
| `storage` | 持久化自定义请求头配置 |
| `<all_urls>`（host_permissions） | 对所有站点生效 |
