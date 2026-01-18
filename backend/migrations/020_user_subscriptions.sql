-- 用户订阅消息记录表
-- 用于追踪用户的订阅消息配额

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  template_type VARCHAR(50) NOT NULL COMMENT '模板类型: INVITATION_RESULT, APPROVAL_RESULT, MATCH_REMINDER, SCORE_CONFIRM',
  remaining_count INT DEFAULT 0 COMMENT '剩余订阅次数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_template (user_id, template_type),
  INDEX idx_template_type (template_type),

  UNIQUE KEY uk_user_template (user_id, template_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户订阅消息配额表';

-- 添加订阅消息发送日志表（可选，用于调试和追踪）
CREATE TABLE IF NOT EXISTS subscription_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT COMMENT '接收用户ID',
  openid VARCHAR(100) COMMENT '用户openid',
  template_type VARCHAR(50) NOT NULL COMMENT '模板类型',
  template_id VARCHAR(100) COMMENT '微信模板ID',
  data JSON COMMENT '发送的数据',
  page VARCHAR(200) COMMENT '跳转页面',
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending' COMMENT '发送状态',
  error_code INT COMMENT '错误码',
  error_msg VARCHAR(500) COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_template_type (template_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅消息发送日志表';
