# 本地开发与部署说明

面向**第一次使用本项目的开发者**：准备 **MySQL**、**Redis**，克隆仓库、配置环境、执行迁移并启动 Node 服务。

---

## 环境要求

| 项 | 说明 |
|----|------|
| **Node.js** | 建议 18 或 20 LTS（`node -v`、`npm -v`） |
| **Git** | `git --version` 可用 |
| **数据库** | **MySQL 8**（`utf8mb4`） |
| **缓存** | **Redis**（默认本机 `6379`） |
| **Docker**（可选） | 用于一键起 MySQL + Redis，见下文 |

---

## 从 GitHub 克隆仓库

1. **安装 Git**（若尚未安装）：<https://git-scm.com> ，终端执行 `git --version` 有版本号即可。

2. **在本地选一个目录**（例如桌面），打开终端进入该目录：

   ```bash
   cd ~/Desktop
   ```

3. **克隆远程仓库**（二选一，把地址换成你仓库的真实 URL）：

   - **HTTPS**（适合未配置 SSH，克隆时可能提示输入 GitHub 账号或 Token）：

     ```bash
     git clone https://github.com/<用户名或组织>/<仓库名>.git
     ```

   - **SSH**（本机已配置 GitHub SSH 密钥时使用）：

     ```bash
     git clone git@github.com:<用户名或组织>/<仓库名>.git
     ```

   在 GitHub 仓库页点击绿色 **Code** 按钮可复制上述地址。

4. **进入项目目录**（`<仓库名>` 与克隆下来的文件夹名一致）：

   ```bash
   cd <仓库名>
   ```

5. **确认已在项目根目录**：应能看到 `package.json`、`docker-compose.yml` 等文件，例如：

   ```bash
   ls
   ```

若仓库有指定默认分支以外的开发分支，克隆后可按需切换：

```bash
git checkout <分支名>
```

完成克隆并进入项目根目录后，继续下面 **「快速开始」** 或其它部署方式。

---

## 快速开始（推荐：Docker）

以下步骤默认你**已完成上一节克隆**，且当前终端**已在项目根目录**（含 `docker-compose.yml`）。按顺序执行。

### 1. 启动 MySQL 与 Redis

```bash
docker compose up -d
```

首次会拉镜像，等待约 30 秒～2 分钟。MySQL 就绪后可看日志：

```bash
docker compose logs -f mysql
```

看到 **ready for connections** 后按 `Ctrl+C` 退出即可。

Compose 默认提供：

- **MySQL 8**：本机 `3306`，库名 **`myproject_dev`**，root 密码 **`devpass123`**（仅本地开发）
- **Redis 7**：本机 `6379`

若 **3306 / 6379** 被占用，可改 `docker-compose.yml` 左侧端口映射，并在 `config/config.json` 里把 MySQL `port` 改成对应本机端口。

### 2. 环境与配置

```bash
cp .env.example .env
cp config/config.example.json config/config.json
cp config/config.example.yaml config/config.yaml
```

编辑 **`.env`**（与 Docker 默认一致时示例）：

```env
DB_PASSWORD=devpass123
JWT_SECRET=请改成足够长的随机字符串
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

编辑 **`config/config.json`** 的 `development`：

- `database`：与上面一致时为 **`myproject_dev`**
- `username`：一般为 **`root`**
- `host`：**`localhost`**
- `port`：**`3306`**（若改了映射则同步修改）
- `password`：保持 **`"${DB_PASSWORD}"`**，密码只写在 `.env`

支付、飞书等见 `.env.example` 注释与 `config/config.yaml` 中的 `${...}` 占位。

### 3. 安装依赖并迁移

```bash
npm install
npm run db:migrate
```

**空库不需要先导入任何 SQL。** 首条迁移 `migrations/20260327070828-baseline.js` 会创建与当前 Model 一致的全量业务表；其后的迁移在历史仓库中用于「逐步加字段」，在新库里若表/列/索引已由 baseline 建好，会**自动跳过**，避免重复报错。

可选查看迁移状态：

```bash
npm run db:migrate:status
```

### 4. 启动服务

```bash
npm start
```

默认 **HTTP 端口 3003**。浏览器打开：

**http://localhost:3003/login.html**

开发热重载：

```bash
npm run dev
```

同一端口上还有 **WebSocket 订单聊天**（见控制台输出的 `ws://...` 说明）。

### 5. 清空 Docker 数据重来

```bash
docker compose down -v
```

`-v` 会删除数据卷，MySQL 数据清空。下次 `docker compose up -d` 后，再执行 **`npm run db:migrate`** 即可得到全新表结构。

仅停容器、保留数据：

```bash
docker compose down
```

---

## 不用 Docker：本机 MySQL / Redis

### MySQL

安装并启动服务后创建数据库（库名与 `config/config.json` 中 `database` 一致）：

```sql
CREATE DATABASE myproject_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
npm install
npm run db:migrate
npm start
```

### Redis

确保本机 Redis 可连，`.env` 中 `REDIS_HOST`、`REDIS_PORT` 与实际情况一致。自检：`redis-cli ping` 返回 `PONG`。

---

## 数据库迁移说明

| 脚本 | 作用 |
|------|------|
| `npm run db:migrate` | 执行未记录的迁移 |
| `npm run db:migrate:status` | 查看已执行记录 |
| `npm run db:migrate:undo` | 回滚最近一次迁移 |

**与旧版文档的区别：** 过去首条 baseline **不建表**，新人必须先导入 `sql/baseline-schema.sql` 再 migrate。当前 **baseline 已在迁移里 `CREATE TABLE` 建齐核心表**，新环境只需保证库已存在、配置正确，然后 **`npm run db:migrate`**。

**已在生产或旧环境跑过迁移的库：** `SequelizeMeta` 里已有记录，不会重复执行已完成的迁移；后续迁移文件中的「已存在则跳过」主要服务于「新库跑完整条迁移链」的场景。

---

## 可选：`sql/baseline-schema.sql`

若团队仍保留 **仅表结构** 的 SQL（例如用 `mysqldump --no-data` 做归档或对照），可放在 `sql/` 下；**对新人默认流程不再强制**。导入方式示例：

```bash
mysql -u root -p myproject_dev < sql/baseline-schema.sql
```

维护者生成结构导出（在结构已是最新的机器上，库名换成实际值）：

```bash
mysqldump -u root -p --no-data 你的库名 > sql/baseline-schema.sql
```

---

## 常用 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm start` | `node server.js` |
| `npm run dev` | `nodemon server.js` |
| `npm run db:migrate` | 数据库迁移 |
| `npm run db:migrate:undo` | 回滚上一次迁移 |
| `npm run db:migrate:status` | 迁移状态 |

---

## 拉取最新代码后

```bash
git pull
npm install
npm run db:migrate
npm start
```

---

## 常见问题

| 现象 | 建议 |
|------|------|
| Docker MySQL 连不上 | `docker compose ps` 是否 healthy；是否等够首次初始化 |
| `ECONNREFUSED`（MySQL） | 容器是否运行；`host` / `port` 是否与端口映射一致 |
| Access denied | `.env` 中 `DB_PASSWORD` 是否与 `docker-compose.yml` 里 `MYSQL_ROOT_PASSWORD` 一致 |
| Redis 连不上 | Redis 是否启动；`REDIS_HOST` / `REDIS_PORT` |
| Unknown database | 先 `CREATE DATABASE`，库名与 `config.json` 一致 |
| 迁移报错 | 核对库名、账号密码、MySQL 版本；可看 `npm run db:migrate:status` |
| 想彻底重来（Docker） | `docker compose down -v` → 再 `up -d` → `npm run db:migrate` |

---

## 技术栈摘要

- **运行时**：Node.js + Express  
- **数据**：MySQL，**Sequelize** + **sequelize-cli**（迁移在 `migrations/`）  
- **缓存**：Redis  
- **实时**：WebSocket（订单聊天，与 HTTP 同端口）  
- **支付**：支付宝 SDK（沙箱/正式按配置）  
- **本地依赖**：可选 Docker Compose（`docker-compose.yml`）

业务接口与流程见 `server.js` 挂载的路由与 `controllers/`、`routes/` 内注释。
