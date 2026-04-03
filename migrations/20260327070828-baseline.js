// migrations/20260327070828-baseline.js
// 空库从零建表：与 models 及后续迁移完成后的列名一致（fund_transactions 为 snake_case）
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('user_auth', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            phone: {
                type: Sequelize.STRING(20),
                allowNull: false,
                unique: true,
                comment: '手机号'
            },
            password: {
                type: Sequelize.STRING(255),
                allowNull: false,
                comment: '密码'
            },
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active',
                comment: '顾客状态：active正常 inactive注销'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        await queryInterface.createTable('user_profile', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                comment: '关联 user_auth.id',
                references: { model: 'user_auth', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            name: { type: Sequelize.STRING(50), allowNull: true, comment: '姓名' },
            birth: { type: Sequelize.DATEONLY, allowNull: true, comment: '生日' },
            gender: { type: Sequelize.TINYINT, allowNull: true, comment: '0:未知 1:男 2:女 3:其他' },
            bio: { type: Sequelize.STRING(500), allowNull: true, comment: '简介' },
            about: { type: Sequelize.TEXT, allowNull: true, comment: '关于' },
            coin: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0,
                comment: '金币，支持两位小数'
            },
            is_completed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: '资料是否完善'
            },
            token_version: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'token版本号，改密码+1'
            },
            timezone: {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'Asia/Shanghai',
                comment: '顾客时区，默认东八区 Asia/Shanghai'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        await queryInterface.createTable('consultant_auth', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            phone: {
                type: Sequelize.STRING(20),
                allowNull: false,
                unique: true,
                comment: '手机号'
            },
            password: {
                type: Sequelize.STRING(255),
                allowNull: false,
                comment: '密码'
            },
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active',
                comment: '顾问状态：active正常 inactive注销'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        await queryInterface.createTable('consultant_profile', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            consultant_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                comment: '关联 consultant_auth.id',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            name: { type: Sequelize.STRING(50), allowNull: true, comment: '顾问昵称' },
            coin: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0,
                comment: '金币，支持两位小数'
            },
            work_status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
                comment: '工作状态 0:离线 1:空闲 2:忙碌'
            },
            total_orders: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: '总订单数'
            },
            rating: {
                type: Sequelize.DECIMAL(3, 2),
                allowNull: false,
                defaultValue: 0.0,
                comment: '评分（0.00-5.00）'
            },
            review_count: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: '评论数'
            },
            signature: { type: Sequelize.STRING(200), allowNull: true, comment: '个性签名' },
            work_duration: { type: Sequelize.STRING(100), allowNull: true, comment: '工作时长（展示文案，如从业年限）' },
            experience: { type: Sequelize.TEXT, allowNull: true, comment: '经历说明' },
            is_completed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: '资料是否完善'
            },
            token_version: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'token版本号，改密码+1'
            },
            timezone: {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'Asia/Shanghai',
                comment: '顾问时区，默认东八区 Asia/Shanghai'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        await queryInterface.createTable('consultant_services', {
            service_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '服务记录 ID，主键，自增长'
            },
            consultant_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '顾问 ID',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            service_type: {
                type: Sequelize.ENUM('咨询', '陪聊', '代办'),
                allowNull: false,
                comment: '服务类型：咨询/陪聊/代办'
            },
            price: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                comment: '服务价格（金币）'
            },
            description: { type: Sequelize.STRING(255), allowNull: true, comment: '服务描述' },
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active',
                comment: '服务状态：active正常 inactive下线'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });
        await queryInterface.addIndex('consultant_services', ['consultant_id', 'service_type'], {
            unique: true,
            name: 'uk_consultant_service'
        });

        const orderStatusEnum = Sequelize.ENUM(
            'pending',
            'accepted',
            'start_invited',
            'in_service',
            'pending_review',
            'completed',
            'cancelled',
            'expired',
            'pending_rush',
            'servicing_requested',
            'servicing_completed'
        );

        await queryInterface.createTable('orders', {
            order_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '订单 ID，主键，自增长'
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '下单用户 ID（谁下的单）',
                references: { model: 'user_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            consultant_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: '接单顾问 ID（谁接的单），接单前为空',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            status: {
                type: orderStatusEnum,
                allowNull: false,
                defaultValue: 'pending',
                comment: '订单状态'
            },
            price: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                comment: '订单金额'
            },
            paid_at: { type: Sequelize.DATE, allowNull: true, comment: '客户完成支付（冻结金币）的时间，未支付为空' },
            survival_seconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 86400,
                comment: '已支付待接单存活时间（秒），默认 86400=24h'
            },
            expires_at: { type: Sequelize.DATE, allowNull: true, comment: '超过此时刻仍未接单则订单过期并退款' },
            expired_at: { type: Sequelize.DATE, allowNull: true, comment: '订单因超时未接单而过期的时间' },
            service_type: {
                type: Sequelize.STRING(50),
                allowNull: false,
                comment: '服务类型（咨询、陪聊、代办等）'
            },
            service_content: {
                type: Sequelize.TEXT,
                allowNull: false,
                comment: '服务内容描述（用户填的需求）'
            },
            address: { type: Sequelize.STRING(255), allowNull: true, comment: '服务地址（如果有线下服务）' },
            contact_phone: { type: Sequelize.STRING(20), allowNull: true, comment: '联系电话' },
            scheduled_time: { type: Sequelize.DATE, allowNull: true, comment: '预约的服务时间' },
            accepted_at: { type: Sequelize.DATE, allowNull: true, comment: '顾问接单时间' },
            completed_at: { type: Sequelize.DATE, allowNull: true, comment: '订单完成时间' },
            cancelled_at: { type: Sequelize.DATE, allowNull: true, comment: '订单取消时间' },
            cancel_reason: { type: Sequelize.STRING(255), allowNull: true, comment: '取消原因' },
            rush_description: { type: Sequelize.STRING(500), allowNull: true, comment: '加急描述' },
            rush_fee: { type: Sequelize.DECIMAL(10, 2), allowNull: true, comment: '加急费用' },
            rush_duration_seconds: {
                type: Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 3600,
                comment: '加急时长（秒）'
            },
            rush_paid_at: { type: Sequelize.DATE, allowNull: true, comment: '加急款支付时间' },
            rush_expires_at: { type: Sequelize.DATE, allowNull: true, comment: '加急接单截止时间' },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        const fundTxnTypeEnum = Sequelize.ENUM(
            '充值',
            '提现',
            '消费',
            '订单取消退款',
            '售后退款',
            '打赏'
        );
        const fundStatusEnum = Sequelize.ENUM('frozen', 'released', 'refunded', 'completed', 'servicing_refunded');
        const servicingReasonEnum = Sequelize.ENUM(
            '服务不满意',
            '服务不及时',
            '服务不专业',
            '服务不热情',
            '服务不耐心',
            '服务不周到',
            '服务不规范',
            '服务不标准',
            '服务不一致'
        );
        const tradeTypeEnum = Sequelize.ENUM('alipay', 'wechat');
        const payStatusEnum = Sequelize.ENUM('pending', 'success', 'failed');

        await queryInterface.createTable('fund_transactions', {
            transaction_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '交易 ID，主键，自增长'
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: '用户 ID',
                references: { model: 'user_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            transaction_type: {
                type: fundTxnTypeEnum,
                allowNull: false,
                comment: '交易类型充值，提现，消费，订单取消退款，售后退款，打赏'
            },
            transaction_amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                comment: '交易金额'
            },
            customer_balance_after: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
                comment: '交易后顾客剩余金额'
            },
            consultant_balance_after: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
                comment: '交易后顾问剩余金额'
            },
            order_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: '订单号',
                references: { model: 'orders', key: 'order_id' },
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            },
            consultant_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: '顾问ID',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            fund_status: {
                type: fundStatusEnum,
                allowNull: false,
                comment: '资金状态'
            },
            reason: { type: Sequelize.STRING(500), allowNull: true, comment: '操作原因说明' },
            operated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '操作时间'
            },
            purpose: { type: Sequelize.STRING(20), allowNull: true, comment: 'main 订单款 rush 加急款' },
            order_commission: { type: Sequelize.DECIMAL(10, 2), allowNull: true, comment: '订单抽成20%（平台抽成20%）' },
            servicing_reason_type: {
                type: servicingReasonEnum,
                allowNull: true,
                comment: '售后退款原因'
            },
            servicing_refund_details: { type: Sequelize.TEXT, allowNull: true, comment: '售后退款详情描述' },
            merchant_order_id: {
                type: Sequelize.STRING(64),
                allowNull: true,
                unique: true,
                comment: '商户订单号（与支付宝 out_trade_no 一致）'
            },
            alipay_trade_no: {
                type: Sequelize.STRING(50),
                allowNull: true,
                unique: true,
                comment: '支付宝交易号'
            },
            trade_type: {
                type: tradeTypeEnum,
                allowNull: true,
                comment: '交易方式 alipay支付宝 wechat微信'
            },
            pay_status: {
                type: payStatusEnum,
                allowNull: false,
                defaultValue: 'pending',
                comment: '支付状态 pending待支付 success支付成功 failed支付失败'
            }
        });
        await queryInterface.addIndex('fund_transactions', ['order_id'], { name: 'fund_transactions_order_id' });
        await queryInterface.addIndex('fund_transactions', ['user_id'], { name: 'fund_transactions_user_id' });

        await queryInterface.createTable('order_reviews', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            order_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                comment: '订单 ID（orders.order_id），一单一评',
                references: { model: 'orders', key: 'order_id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            from_user_id: { type: Sequelize.INTEGER, allowNull: true, comment: '评价人 ID' },
            from_role: {
                type: Sequelize.ENUM('user', 'consultant'),
                allowNull: false,
                comment: '评价人角色'
            },
            to_user_id: { type: Sequelize.INTEGER, allowNull: false, comment: '被评价人 ID' },
            to_role: {
                type: Sequelize.ENUM('user', 'consultant'),
                allowNull: false,
                comment: '被评价人角色'
            },
            rating: {
                type: Sequelize.DECIMAL(3, 1),
                allowNull: false,
                comment: '评分 0～5，步长 0.1'
            },
            content: { type: Sequelize.TEXT, allowNull: true, comment: '文字评价（最多 100 字）' },
            tags: { type: Sequelize.JSON, allowNull: true, comment: '评价标签' },
            reply_content: { type: Sequelize.TEXT, allowNull: true, comment: '被评价方回复' },
            reply_at: { type: Sequelize.DATE, allowNull: true, comment: '回复时间' },
            review_at: { type: Sequelize.DATE, allowNull: true, comment: '评价时间' }
        });
        await queryInterface.addIndex('order_reviews', ['from_user_id'], { name: 'order_reviews_from_user_id' });
        await queryInterface.addIndex('order_reviews', ['to_user_id'], { name: 'order_reviews_to_user_id' });
        await queryInterface.addIndex('order_reviews', ['to_user_id', 'to_role'], {
            name: 'order_reviews_to_user_id_to_role'
        });

        await queryInterface.createTable('order_chat_messages', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            order_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '订单 ID，关联 orders.order_id',
                references: { model: 'orders', key: 'order_id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            sender_id: { type: Sequelize.INTEGER, allowNull: false, comment: '发送者 ID' },
            sender_role: {
                type: Sequelize.ENUM('user', 'consultant'),
                allowNull: false,
                comment: '发送者角色'
            },
            receiver_id: { type: Sequelize.INTEGER, allowNull: false, comment: '接收者 ID' },
            receiver_role: {
                type: Sequelize.ENUM('user', 'consultant'),
                allowNull: false,
                comment: '接收者角色'
            },
            content: { type: Sequelize.TEXT, allowNull: false, comment: '消息内容' },
            content_type: {
                type: Sequelize.ENUM('text', 'image', 'file'),
                allowNull: false,
                defaultValue: 'text',
                comment: '消息类型'
            },
            is_read: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: '是否已读'
            },
            read_at: { type: Sequelize.DATE, allowNull: true, comment: '读取时间' },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            }
        });
        await queryInterface.addIndex('order_chat_messages', ['order_id'], {
            name: 'order_chat_messages_order_id'
        });

        await queryInterface.createTable('collects', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '用户ID',
                references: { model: 'user_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            consultantId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '顾问ID',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '创建时间'
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '更新时间'
            }
        });

        await queryInterface.createTable('tippings', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                comment: '主键'
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '用户ID',
                references: { model: 'user_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            consultantId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '顾问ID',
                references: { model: 'consultant_auth', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            tipAmount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                comment: '打赏金额'
            },
            orderId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: '订单ID',
                references: { model: 'orders', key: 'order_id' },
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                comment: '打赏创建时间'
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
                comment: '打赏更新时间'
            }
        });

        console.log('✅ baseline：已创建全量表（空库可从此迁移链跑通）');
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('tippings');
        await queryInterface.dropTable('collects');
        await queryInterface.dropTable('order_chat_messages');
        await queryInterface.dropTable('order_reviews');
        await queryInterface.dropTable('fund_transactions');
        await queryInterface.dropTable('orders');
        await queryInterface.dropTable('consultant_services');
        await queryInterface.dropTable('consultant_profile');
        await queryInterface.dropTable('user_profile');
        await queryInterface.dropTable('consultant_auth');
        await queryInterface.dropTable('user_auth');
        console.log('⚠️ baseline down：已删除 baseline 创建的全部表');
    }
};
