-- 管理后台登录密码字段
ALTER TABLE users ADD COLUMN admin_password VARCHAR(255) DEFAULT NULL COMMENT '管理后台密码(bcrypt)';
ALTER TABLE users ADD COLUMN password_changed TINYINT(1) DEFAULT 0 COMMENT '是否已修改初始密码';
