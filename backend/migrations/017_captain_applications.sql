-- 领队申请表
CREATE TABLE IF NOT EXISTS captain_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_id INT NOT NULL COMMENT '申请的赛事ID',
  user_id INT NOT NULL COMMENT '申请人ID',

  -- 申请信息
  reason TEXT COMMENT '申请理由',

  -- 审批信息
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '状态',
  reviewed_by INT COMMENT '审批人ID',
  reviewed_at DATETIME COMMENT '审批时间',
  reject_reason VARCHAR(500) COMMENT '拒绝理由',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_event_user (event_id, user_id),
  INDEX idx_event (event_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领队申请表';
