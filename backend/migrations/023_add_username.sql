-- 用户表添加用户名字段（用于管理后台登录）
ALTER TABLE users ADD COLUMN username VARCHAR(50) COMMENT '用户名（管理后台登录用）' AFTER phone;
ALTER TABLE users ADD UNIQUE INDEX idx_username (username);
