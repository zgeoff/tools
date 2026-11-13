# Changelog

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/mcp-auth@0.1.0...@zgeoff/mcp-auth@0.2.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **mcp-auth:** admin.clients.remove and admin.clients.update take a client ID instead of a name. admin.clients.readByName finds clients by name.

### Features

* **mcp-auth:** share the app's kysely and address clients by id ([#636](https://github.com/zgeoff/tools/issues/636)) ([d392ca7](https://github.com/zgeoff/tools/commit/d392ca77af378acd353a197b4d6268d661c6641a))

## 0.1.0 (2026-11-13)


### Features

* **mcp-auth:** add the elysia adapter ([#634](https://github.com/zgeoff/tools/issues/634)) ([4fb50bc](https://github.com/zgeoff/tools/commit/4fb50bccd36170604cc90b1dbf1bcb8e7a6dec57))
* **mcp-auth:** add the passkey and OAuth auth core package ([#633](https://github.com/zgeoff/tools/issues/633)) ([596295d](https://github.com/zgeoff/tools/commit/596295d05b703d4f4d6d94c97909db634ec177cc))
