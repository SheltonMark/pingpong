-- 约球表
CREATE TABLE IF NOT EXISTS match_invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT COMMENT '关联帖子ID',
  creator_id INT NOT NULL COMMENT '发起人',

  -- 约球信息
  title VARCHAR(100) COMMENT '标题',
  description VARCHAR(500) COMMENT '描述',
  location VARCHAR(200) COMMENT '地点',
  scheduled_time DATETIME COMMENT '约定时间',
  max_participants INT DEFAULT 2 COMMENT '最大参与人数',

  -- 学校
  school_id INT COMMENT '所属学校',
  allow_cross_school TINYINT(1) DEFAULT 1 COMMENT '允许跨校',

  -- 状态: open/full/ongoing/finished/cancelled
  status ENUM('open', 'full', 'ongoing', 'finished', 'cancelled') DEFAULT 'open',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_creator (creator_id),
  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_time (scheduled_time),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='约球表';

-- 约球参与者表
CREATE TABLE IF NOT EXISTS invitation_participants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invitation_id INT NOT NULL,
  user_id INT NOT NULL,

  -- 状态
  status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',

  -- 时间戳
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME,

  UNIQUE KEY uk_invitation_user (invitation_id, user_id),
  INDEX idx_user (user_id),
  FOREIGN KEY (invitation_id) REFERENCES match_invitations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='约球参与者表';

-- 为 matches 表添加 invitation_id 字段（如果不存在）
-- 注意：这个 ALTER 语句可能因为列已存在而跳过
ALTER TABLE matches ADD COLUMN invitation_id INT COMMENT '约球ID' AFTER event_id;

ALTER TABLE matches ADD INDEX idx_invitation (invitation_id);

ALTER TABLE matches ADD CONSTRAINT fk_match_invitation FOREIGN KEY (invitation_id) REFERENCES match_invitations(id) ON DELETE CASCADE;
