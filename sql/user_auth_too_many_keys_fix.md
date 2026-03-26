# user_auth 索引超过 64 个（ER_TOO_MANY_KEYS）处理说明

## 先澄清：不是「最多 64 个用户」

- **64** 指的是：**同一张表里，最多 64 个「索引」**（主键、唯一键、普通索引都算），是 MySQL 对**表结构**的限制。
- **用户行数**可以成千上万，和这个 64 **无关**。

## 一键脚本（推荐）

在项目根目录执行：

```bash
node scripts/fix-auth-duplicate-phone-indexes.js
```

会自动检查 `user_auth`、`consultant_auth` 上是否对 `phone` 重复建了多份 UNIQUE，只保留一份，其余删除。执行成功后再 `node server.js`。

## 原因

长期执行 `sequelize.sync({ alter: true })` 时，可能对同一列（如 `phone`）反复尝试加 `UNIQUE`，MySQL 会不断新建唯一索引而不删掉旧的，最终触顶 64 个索引。

## 第一步：看清当前有哪些索引

在 **testdb3**（或你实际库名）里执行：

```sql
SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_auth'
GROUP BY INDEX_NAME, NON_UNIQUE
ORDER BY INDEX_NAME;
```

数一下有多少个不同的 `INDEX_NAME`。正常一般很少（例如 `PRIMARY` + 1 个 `phone` 唯一索引）。

## 第二步：删掉多余索引（务必保留 PRIMARY）

1. **不要删** `PRIMARY`。
2. 对 `phone` 列：只**保留一个**唯一索引即可（任选其中一个 `Key_name` 保留）。
3. 其余在 `SHOW INDEX FROM user_auth` 里看到的、作用在 `phone` 上的多余唯一索引，逐个删除：

```sql
ALTER TABLE user_auth DROP INDEX `这里填索引名`;
```

索引名以你库里 `SHOW INDEX FROM user_auth` 的 `Key_name` 为准，常见冗余形态：`phone`、`phone_1`、`phone_2`、`user_auth_phone_key` 等。

若不确定，可先对**明显带数字后缀**的重复名执行 `DROP INDEX`，每删一次再 `SHOW INDEX` 确认，直到：

- 索引总数远小于 64；
- `phone` 上仍有一个 `UNIQUE`（或你确认业务允许的唯一约束仍存在）。

## 第三步：再启动 Node

```bash
node server.js
```

## 第四步：避免再次堆索引（见 server.js）

项目已改为：**默认不再 `alter: true`**。若本地确实需要 Sequelize 自动改表结构，可临时：

```bash
export SEQUELIZE_SYNC_ALTER=1
node server.js
```

表结构稳定后请去掉该环境变量，日常不要长期开 `alter`。
