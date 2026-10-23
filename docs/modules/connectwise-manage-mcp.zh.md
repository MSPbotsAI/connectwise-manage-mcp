# 模块：connectwise-manage-mcp

仓库：`https://github.com/MSPbotsAI/connectwise-manage-mcp`。这是一个把 ConnectWise Manage REST API
包装成一组 `cw_*` 工具（`src/tools/*.ts`）的 MCP server，背后是 `createMcpServer()`
（`src/mcp-server.ts`）里建的一个按请求生成的 `CwManageClient`（`src/api-client.ts`）。没有自己的数据库——
每个工具都是对 ConnectWise Manage REST API 的透传。

## PRD-20969 · 2026-10-23

状态：待合入 `main`——本模块文档的 `path:line` 引用都在工作分支 `dev01.mbagent/PRD-20969` @
`eab3d7e` 上，尚未进 `main`。切这条分支时的基线：`main` @ `f4f85f8`。

- **多租户隔离是结构性的，不是靠参数传递的。** `createMcpServer(configOverride?)`
  （`src/mcp-server.ts:100`）每次调用只建一个 `CwManageClient`（`src/mcp-server.ts:156`，
  `const client = new CwManageClient(config)`），并把这同一个 `client` 传给每一次
  `register*Tools(server, client)` 调用（例如 `:162` 的 `registerTimeEntryTools`、`:166` 的
  `registerServiceTools`）。没有任何工具把租户标识当作调用方传入的参数；当前生效的租户完全由
  网关/环境变量在那次 `createMcpServer()` 调用时注入的凭据决定。这个仓库以后新增的工具都应该照这个
  形状写——绝不要 import 一个模块级的 `CwManageClient` 单例。
- **"传了才转发进请求体"这个约定**贯穿每一个创建/更新工具（例如 `src/tools/tickets.ts` 的
  `cw_create_ticket`、`src/tools/time-entries.ts` 的 `cw_create_time_entry`）：对数字/布尔这类有意义的
  假值用 `if (x !== undefined)` 守卫，对字符串/id 这类 `0`/`""` 本来就不是合法输入的用 `if (x)`。
  这个仓库除了每个工具自己的 zod schema 之外没有中心化的校验层。
- **`cw_list_*` 按看板查询的模式**：`GET /service/boards/{boardId}/<resource>`，`boardId` 必填（schema
  强制，拒绝发生在任何 HTTP 调用之前），`conditions`/`page`/`pageSize` 可选，默认 `page=1`、
  `pageSize=25`。由既有的 `cw_list_statuses`（`src/tools/service.ts`）确立，PRD-20969 新增
  `cw_list_ticket_types`、`cw_list_ticket_subtypes`、`cw_list_ticket_items` 延续了这个模式。不按看板
  查询的全局查询工具如 `cw_list_work_types` / `cw_list_work_roles`（`src/tools/time-entries.ts`，
  PRD-20969）用同样的 `conditions`/`page`/`pageSize` 形状，没有必填字段。
- **测试约定**：这个仓库没有连真实 ConnectWise 的集成测试（PRD-20969 设计时读过 `src/__tests__/` 下
  全部 12 个既有文件确认过，2026-10-21）。每条测试都是拿工具注册的 handler 对着一个手写的
  `StubClient`（实现 `get`/`post`/`patch`/`delete` 并记录调用）跑，再断言记录下来的
  `path`/`params`/`body`——这个模式最清晰的示范是 `src/__tests__/procurement.test.ts`，另外三个实例
  是 `src/__tests__/service.test.ts` / `src/__tests__/tickets.test.ts` /
  `src/__tests__/time-entries.test.ts`（PRD-20969 新增）。
- **两条测试写死了注册工具的总数**，以后任何一张单增删工具都要同步改这两处：
  `src/__tests__/ticket-configurations.test.ts`（`expect(tools).toHaveLength(N)`）和
  `src/__tests__/update-contact.test.ts`（`expect(names).toHaveLength(N)`）。PRD-20969 把两处都从
  87 改成了 92（新增 5 个工具，没删除任何工具）。以后哪张单的门禁卡在这两条断言上，大概率就是这个
  原因——改字面量，不要把测试静音。
- **版本号是自动管理的**：`semantic-release`（`.releaserc.json`，在 `main` 上触发）在合入时自动生成
  changelog、给 `package.json` 升版本号、建 GitHub release。本流水线里任何一张单都不应该手改
  `package.json` 的版本号或手改 `CHANGELOG.md`。
