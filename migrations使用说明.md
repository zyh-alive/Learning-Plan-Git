# 数据库 Migration 使用说明

> **本项目**：**`config/config.json`** 只放数据库（development/test/production，与 sequelize-cli 一致）；**`config/config.yaml`** 放端口、JWT、飞书等其余配置；**`config/index.js`** 合并两者并对 `${...}` 做环境变量替换；**`config/config.js`** 供 CLI 读取 `config.json` 并做同样替换（`npm run db:migrate*` 已带 `--config config/config.js`，无需 `.sequelizerc`）。本地可复制 **`config/config.example.json`** 为 `config.json`。

---

后续增删改字段或者表的操作
1.# 1. 创建 migration 文件
npx sequelize-cli migration:generate --name add-phone-to-users

# 2. 编写 migration
# 编辑 migrations/xxxxxx-add-phone-to-users.js

# 3. 执行 migration
npx sequelize-cli db:migrate

# 4. 更新 Model
# 编辑 models/User.js，添加 phone 字段

#5.查看状态
npx sequelize-cli db:migrate:status
看到控制台：up 20260327070828-baseline.js就是正常

6.回滚
回滚最后一次 migration
npm run db:migrate:undo

###########新项目配置############
1.npm init -y 初始化
2.安装依赖
# 生产依赖
npm install express sequelize mysql2 dotenv js-yaml

# 开发依赖
npm install --save-dev sequelize-cli nodemon

3.初始化目录结构
# 创建文件夹
mkdir config models migrations controllers routes server.js(主文件)

# 初始化 sequelize
npx sequelize-cli init
# 这会创建 config/config.json 和 models/index.js

4.创建配置文件
cat > .gitignore << 'EOF'
node_modules/
.env
config/config.yaml
.DS_Store
*.log
EOF

5.创建.env.example
cat > .env.example << 'EOF'
# 数据库密码
DB_PASSWORD=your_password

# JWT 密钥
JWT_SECRET=your-secret-key

# 飞书配置
FEISHU_BOT_WEBHOOK=https://open.feishu.cn/xxx
ENABLE_FEISHU_MORNING=1
FEISHU_MORNING_HOUR=8
FEISHU_MORNING_MINUTE=0
EOF

6.编辑.env（环境变量）
cat > .env << 'EOF'
DB_PASSWORD=123456
JWT_SECRET=my-secret-key
FEISHU_BOT_WEBHOOK=https://open.feishu.cn/xxx
ENABLE_FEISHU_MORNING=1
FEISHU_MORNING_HOUR=8
FEISHU_MORNING_MINUTE=0
EOF

7.编辑config.yaml
cat > config/config.yaml << 'EOF'
# 应用配置
server:
  port: 3000

jwt:
  secret: ${JWT_SECRET}
  expiresIn: 7d

logging:
  level: info
  sql: true

feishu:
  botWebhook: ${FEISHU_BOT_WEBHOOK}
  enableMorningBrief: ${ENABLE_FEISHU_MORNING}
  morningHour: ${FEISHU_MORNING_HOUR}
  morningMinute: ${FEISHU_MORNING_MINUTE}
EOF

8.编辑config/config.json
cat > config/config.json << 'EOF'
{
  "development": {
    "username": "root",
    "password": "123456",
    "database": "myapp_dev",
    "host": "127.0.0.1",
    "dialect": "mysql"
  }
}
EOF

总的来说：config.yaml管服务配置，config.json管数据库配置，config.js让sequelize-cli读取数据库配置，给 migration 用





本文说明在本项目中如何用 **Sequelize CLI** 管理 **MySQL** 的结构变更（`migrations/` 目录）。实现依赖：`sequelize`、`sequelize-cli`（见 `package.json`）。

---

## 1. Migration 是什么、和现有代码的关系

- **Migration** 是一组按时间顺序执行的脚本，用来**记录并复现**数据库结构变更（加列、加索引、建新表等）。
- 本仓库已有一份 **基线迁移** `migrations/20260327070828-baseline.js`：不在库里执行建表，只作为「这些表已由历史环境建好」的**起点标记**，后续增量迁移会接在它之后执行。
- 应用启动时仍使用 `server.js` 里的 **`sequelize.sync()`**（可选 `SEQUELIZE_SYNC_ALTER=1`）做开发期同步；**生产环境**更推荐以 migration 为准、谨慎使用 `alter: true`。团队内应约定：**结构变更以 migration 为单一事实来源**，避免只改模型、不写迁移。

---

## 2. 前置条件

| 项目 | 说明 |
|------|------|
| Node.js | 与 `package.json` 中引擎要求一致即可。 |
| MySQL | 可连接的目标库，库名与账号与配置一致。 |
| CLI 配置 | Sequelize CLI **默认读取**项目根下 `config/config.json`（多环境：`development` / `test` / `production`）。 |

**关于 `config/config.json`：**

- 该文件在 **`.gitignore`** 中，**不会进 Git**，避免把密码提交到仓库。
- 本地可从 **`config/config_migration_example.json`** 复制一份为 `config/config.json`，再按本机修改 `username`、`password`、`database`、`host`。
- 执行 CLI 时通过 **`NODE_ENV`** 选择配置段，例如本地开发一般为 `development`（见下文命令）。

业务运行时仍使用 **`config/config.yaml` + `.env`**（`config/index.js` / `config/database.js`）；**仅运行 migration 时**需要上述 **`config/config.json`** 与 CLI 对齐同一套库，避免改错库。

---

## 3. 常用命令

在项目根目录执行（`npx` 会使用本项目的 `sequelize-cli`）：

| 目的 | 命令 |
|------|------|
| 查看帮助 | `npx sequelize-cli --help` |
| 查看迁移子命令 | `npx sequelize-cli db:migrate --help` |
| **执行全部未执行的迁移** | `NODE_ENV=development npx sequelize-cli db:migrate` |
| **撤销上一次迁移** | `NODE_ENV=development npx sequelize-cli db:migrate:undo` |
| **撤销全部迁移** | `NODE_ENV=development npx sequelize-cli db:migrate:undo:all` |
| **查看已执行 / 待执行** | `NODE_ENV=development npx sequelize-cli db:migrate:status` |

Windows（cmd）若不支持 `NODE_ENV=development` 前缀，可先执行 `set NODE_ENV=development` 再运行 `npx sequelize-cli ...`，或使用 PowerShell：`$env:NODE_ENV="development"; npx sequelize-cli db:migrate`。

---

## 4. 新建一条迁移

```bash
NODE_ENV=development npx sequelize-cli migration:generate --name add-xxx-to-yyy
```

会在 `migrations/` 下生成带时间戳的文件，例如 `20260328120000-add-xxx-to-yyy.js`。在 **`up`** 里写升级逻辑，在 **`down`** 里写可逆的回滚（删除列、删索引等）；若业务上不可回滚，`down` 里应明确 `throw` 或打日志说明，避免误用 `db:migrate:undo` 造成数据不一致。

编写时使用 Sequelize 提供的 API，例如：

- `queryInterface.addColumn` / `removeColumn`
- `queryInterface.addIndex` / `removeIndex`
- `queryInterface.createTable` / `dropTable`
- 必要时 `queryInterface.sequelize.query` 执行原生 SQL

具体参数见 [Sequelize 文档：QueryInterface](https://sequelize.org/docs/v6/other-topics/query-interface/)。

---

## 5. Sequelize 如何记录「执行到哪一步」

首次成功执行迁移后，MySQL 中会出现表 **`SequelizeMeta`**，其中保存已执行的迁移文件名。再次执行 `db:migrate` 时只会跑尚未记录的迁移。

- 不要随意删除生产库中的 `SequelizeMeta` 行。
- **不要**修改已合并到主分支且已在线上跑过的迁移文件内容；应再新建一条迁移做修正。

---

## 6. 基线迁移 `20260327070828-baseline.js` 说明

- **`up`**：仅打印说明，**不创建表**（假定当前库已存在 `UserAuth`、`Order`、`ConsultantProfile` 等模型对应表）。
- **`down`**：不执行破坏性操作，仅日志提示。

适用于：**库表早已通过 `sync` 或手工建好**，现在才开始用 CLI 管版本的情况。若全新空库且只依赖 migration 建表，则需要另写真实建表迁移或调整策略，并与团队约定一致。

---

## 7. 建议流程（团队协作）

1. 从主分支拉最新代码。
2. 本地配置好 `config/config.json` 与 `.env`，确认连的是**自己的开发库**。
3. 新建分支 → `migration:generate` → 实现 `up` / `down` → 本地 `db:migrate` 自测。
4. 提交 `migrations/` 下新文件，Code Review 后合并。
5. 测试 / 生产由运维或 CI 在对应 `NODE_ENV` 下执行 `db:migrate`（并做好备份）。

---

## 8. 常见问题

| 现象 | 可能原因 |
|------|----------|
| 提示找不到配置 | 未创建 `config/config.json`，或路径不对；CLI 默认读项目根 `config/config.json`。 |
| 连错库 | `config/config.json` 与 `config.yaml` 不一致；执行前核对 `database`、`host`。 |
| 迁移已执行但想重跑 | 不应手改历史文件；应 `undo` 或新建迁移。生产上 `undo` 风险大，需评估。 |
| 与 `sync()` 冲突 | 同一张表既靠 `sync` 又靠 migration 改结构时容易乱；约定开发阶段以谁为主，上线前固化到 migration。 |

---

## 9. 相关文件一览

| 路径 | 作用 |
|------|------|
| `migrations/` | 迁移脚本目录 |
| `config/config.json` | Sequelize CLI 连接配置（本地自建，不入库） |
| `config/config_migration_example.json` | CLI 配置示例 |
| `config/database.js` | 应用运行时 Sequelize 连接（读 `config/index.js`） |

如需把 CLI 配置路径改到别处，可在项目根增加 **`.sequelizerc`** 指定 `config`、`migrations-path` 等（当前文档未强制要求，使用 CLI 默认约定即可）。
