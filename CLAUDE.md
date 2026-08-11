# clash-config-editor 项目开发规则（2026-08-12 补齐）

## 项目结构（两处代码）

| 目录 | 角色 | 说明 |
|---|---|---|
| `hermes项目\clash-config-editor\` | **源码仓库**（GitHub: AresKING108/clash-config-editor，main 分支） | Vue3 + Vite 前端源码（frontend/）+ 后端 server.js（backend/） |
| `hermes项目\clash-editor-native\` | **运行实例**（3000 端口） | 前端编译产物 public/assets/index-*.js + server.js；由大管家保活 |

**重要**：运行实例的前端是编译产物，源码在 clash-config-editor/frontend/。改前端必须：改源码 → `npm run build` → 把编译产物拷到运行实例 public/assets/ → 重启 3000。

## 技术栈

- 前端：Vue 3 + Vite + Element Plus（frontend/ 下：src/views、src/components、src/router、src/stores）
- 后端：Node.js Express（ESM，server.js），js-yaml 解析
- 数据目录：configDir = `../configs`（相对运行实例）
- 依赖：node_modules 里 express/js-yaml/cors/multer/joi

## 与订阅转换的关系（2026-08 定稿）

- 订阅转换后端：SubConverter-Extended v1.4.2（路由器 25500，配置根 /etc/subconverter/）
- **Extended 外部配置必须用 TOML 格式**（[[custom_groups]] 表 + rule/use 数组 + url/interval/timeout/tolerance）
- **引用 provider 必须用 `use = ["Provider_TempXiaoxi"]` 字段**（`!!PROVIDER=` 在 TOML 里已废，只当 filter 字符串）
- 本地可复用转换核心：`hermes项目\configs\subconverter_tools\candy_toml_core.js`（HEADER/groupToToml/assertGroups/BUILTIN）+ gen_candy_toml.js + ini2toml.js
- 36 组权威数据源：`openclash_backup_preupdate\20260810_231625_换订阅前\config\糖果.yaml`
- sub_ini.list（路由器 /usr/share/openclash/res/sub_ini.list）= OpenClash 模板下拉来源；config= 参数取第 3 列 URL（openclash.sh:414）
- 路由器 SSH 免密：root@192.168.32.1

## 关键 API（server.js）

| 路由 | 作用 | 已知问题 |
|---|---|---|
| POST /api/config/save-as-template | 从 openclash_*.yaml 提取策略组存模板 | **输出旧 ini 格式（反引号）→ Extended 不认**，需改 TOML（2026-08-12 待办） |
| POST /api/config/validate | 校验配置（clash -t） | 正常 |
| POST /api/router/push | 推送文件到路由器 + 可选重载 | 前端 save-as-template 后已调它推 /etc/subconverter/ |
| GET /api/router/subconverter-status | 查 25500 状态 | 已修 36611→25500 bug |
| POST /api/router/delete-file | 删路由器文件 | 正常 |

## 前端 tab 结构（MainPage.vue）

3 个 tab：`OpenClash 热重载`（含「校验」「另存为模板」按钮）/ `Subconverter 模板`（拉取/推送 /etc/subconverter/ 配套文件）/ `上传文件`

## 开发规则（2026-08-12 用户要求补齐）

1. **改前端必须走源码 → build → 拷产物**，禁止直接改编译产物 index-*.js
2. **save-as-template 输出格式 = TOML**（复用 candy_toml_core.js 转换核心），不是旧 ini
3. 改动前备份运行实例 server.js / 产物；改完重启 3000 并验证（curl + 页面）
4. 不碰大管家源码 / .env / 密钥；不 git 回滚（磁盘版可能比 GitHub 新）
5. 验证必须有实际输出（curl 返回、mihomo -t、页面可见变化）
6. 路由器操作走 SSH 免密；不触发真实订阅更新（等用户手动）
7. 桌面红线：无弹窗、无窗口闪现、不截图全屏

## 已知坑

- 前端无 .vue 源码的旧认识是错的——源码在 clash-config-editor/frontend/，clone 自 GitHub
- 本地编译产物可能比 GitHub 源码旧或新——对比 git log 与产物构建时间
- save-as-template 的「推送路由器」前端逻辑已有（调 /api/router/push 到 /etc/subconverter/），断点是后端输出格式
