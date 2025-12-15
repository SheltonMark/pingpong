-- 赛事表
CREATE TABLE IF NOT EXISTS events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL COMMENT '赛事名称',
  description TEXT COMMENT '赛事描述',

  -- 赛事类型和赛制
  event_type ENUM('singles', 'doubles', 'team') NOT NULL COMMENT '类型：单打/双打/团体',
  event_format ENUM('round_robin', 'knockout') NOT NULL COMMENT '赛制：循环赛/淘汰赛',
  scope ENUM('school', 'inter_school') DEFAULT 'school' COMMENT '范围：校内/校际',

  -- 比赛规则
  best_of INT DEFAULT 5 COMMENT '几局几胜的总局数(如5局3胜)',
  points_per_game INT DEFAULT 11 COMMENT '每局分数',
  counts_for_ranking TINYINT(1) DEFAULT 1 COMMENT '是否计入积分排名(仅单打可选)',

  -- 时间
  registration_start DATETIME COMMENT '报名开始时间',
  registration_end DATETIME COMMENT '报名截止时间',
  event_start DATETIME COMMENT '比赛开始时间',
  event_end DATETIME COMMENT '比赛结束时间',

  -- 地点和限制
  location VARCHAR(200) COMMENT '比赛地点',
  max_participants INT COMMENT '最大参赛人数/队伍数',

  -- 关联
  school_id INT COMMENT '所属学校(校内赛)',
  created_by INT NOT NULL COMMENT '创建人',

  -- 状态: draft/registration/ongoing/finished/cancelled
  status ENUM('draft', 'registration', 'ongoing', 'finished', 'cancelled') DEFAULT 'draft',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_type (event_type),
  INDEX idx_start (event_start),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赛事表';

-- 赛事报名表
CREATE TABLE IF NOT EXISTS event_registrations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_id INT NOT NULL,
  user_id INT NOT NULL COMMENT '报名用户',

  -- 双打配对
  partner_id INT COMMENT '双打搭档ID',
  partner_status ENUM('pending', 'confirmed', 'rejected') COMMENT '搭档确认状态',

  -- 团体赛
  team_name VARCHAR(50) COMMENT '队伍名称',
  is_team_leader TINYINT(1) DEFAULT 0 COMMENT '是否领队',
  team_leader_id INT COMMENT '所属领队(队员)',

  -- 状态
  status ENUM('pending', 'confirmed', 'cancelled', 'waiting_partner') DEFAULT 'pending',

  -- 时间戳
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME,

  UNIQUE KEY uk_event_user (event_id, user_id),
  INDEX idx_event (event_id),
  INDEX idx_user (user_id),
  INDEX idx_partner (partner_id),
  INDEX idx_team_leader (team_leader_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (partner_id) REFERENCES users(id),
  FOREIGN KEY (team_leader_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赛事报名表';

-- 比赛/对阵表
CREATE TABLE IF NOT EXISTS matches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_id INT NOT NULL,

  -- 对阵双方 (可以是用户ID或队伍报名ID)
  player1_id INT COMMENT '选手1/队伍1',
  player2_id INT COMMENT '选手2/队伍2',
  player1_reg_id INT COMMENT '选手1报名ID',
  player2_reg_id INT COMMENT '选手2报名ID',

  -- 比赛信息
  round INT COMMENT '轮次(淘汰赛用)',
  match_order INT COMMENT '场次序号',
  scheduled_time DATETIME COMMENT '预定时间',

  -- 结果
  winner_id INT COMMENT '胜者ID',
  player1_games INT DEFAULT 0 COMMENT '选手1赢的局数',
  player2_games INT DEFAULT 0 COMMENT '选手2赢的局数',

  -- 状态
  status ENUM('scheduled', 'ongoing', 'pending_confirm', 'finished', 'cancelled') DEFAULT 'scheduled',

  -- 确认
  player1_confirmed TINYINT(1) DEFAULT 0,
  player2_confirmed TINYINT(1) DEFAULT 0,
  admin_confirmed TINYINT(1) DEFAULT 0,

  -- 时间戳
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_event (event_id),
  INDEX idx_player1 (player1_id),
  INDEX idx_player2 (player2_id),
  INDEX idx_status (status),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (player1_id) REFERENCES users(id),
  FOREIGN KEY (player2_id) REFERENCES users(id),
  FOREIGN KEY (player1_reg_id) REFERENCES event_registrations(id),
  FOREIGN KEY (player2_reg_id) REFERENCES event_registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='比赛对阵表';

-- 比分记录表(每局比分)
CREATE TABLE IF NOT EXISTS match_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  match_id INT NOT NULL,
  game_number INT NOT NULL COMMENT '第几局',
  player1_score INT NOT NULL DEFAULT 0,
  player2_score INT NOT NULL DEFAULT 0,
  recorded_by INT COMMENT '录入人',
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_match_game (match_id, game_number),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='比分记录表';

-- 公告表
CREATE TABLE IF NOT EXISTS announcements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL,
  content TEXT,
  image_url VARCHAR(500) COMMENT '图片URL',
  link_type ENUM('none', 'event', 'url') DEFAULT 'none',
  link_event_id INT COMMENT '关联赛事',
  link_url VARCHAR(500) COMMENT '外部链接',
  school_id INT COMMENT '所属学校(NULL表示全局)',
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,

  INDEX idx_school (school_id),
  INDEX idx_active (is_active),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (link_event_id) REFERENCES events(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告表';
