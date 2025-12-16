-- 积分变动历史表
CREATE TABLE IF NOT EXISTS rating_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',

  -- 积分变动
  points_before INT NOT NULL COMMENT '变动前积分',
  points_after INT NOT NULL COMMENT '变动后积分',
  points_change INT NOT NULL COMMENT '积分变化值',

  -- 变动来源
  source_type ENUM('match', 'initial', 'admin_adjust', 'event_bonus') NOT NULL COMMENT '来源类型',
  match_id INT COMMENT '关联比赛ID',
  event_id INT COMMENT '关联赛事ID',

  -- 对手信息（比赛类型）
  opponent_id INT COMMENT '对手ID',
  opponent_points INT COMMENT '对手当时积分',
  is_winner TINYINT(1) COMMENT '是否获胜',

  -- 备注
  remark VARCHAR(200) COMMENT '备注说明',

  -- 时间
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user (user_id),
  INDEX idx_match (match_id),
  INDEX idx_event (event_id),
  INDEX idx_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分变动历史表';

-- 添加用户表的赛前积分字段（用于记录赛事开始时的积分）
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_before_event INT DEFAULT NULL COMMENT '赛前积分（临时）';
