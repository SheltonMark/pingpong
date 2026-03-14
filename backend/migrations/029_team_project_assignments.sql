-- 029_team_project_assignments.sql
-- 添加团体赛项目配置和项目分配表

-- 1. 为 events 表添加 team_event_config 字段
ALTER TABLE events
ADD COLUMN team_event_config JSON COMMENT '团体赛项目配置' AFTER singles_player_count;

-- 2. 创建项目分配表
CREATE TABLE IF NOT EXISTS team_project_assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_id INT NOT NULL COMMENT '赛事ID',
  team_name VARCHAR(100) NOT NULL COMMENT '队伍名称',
  project_type ENUM('men_singles', 'women_singles', 'men_doubles', 'women_doubles', 'mixed_doubles') NOT NULL COMMENT '项目类型',
  position INT NOT NULL COMMENT '位置编号，单打为1,2,3...，双打为对数',
  player_a_id INT NOT NULL COMMENT '选手A的user_id，单打时只用这个字段',
  player_b_id INT NULL COMMENT '选手B的user_id，仅双打使用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assignment (event_id, team_name, project_type, position),
  KEY idx_event_team (event_id, team_name),
  KEY idx_player_a (player_a_id),
  KEY idx_player_b (player_b_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (player_a_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player_b_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团体赛项目分配表';

-- 3. 为现有团体赛事添加默认配置（向后兼容）
-- 将旧的 singles_player_count 转换为新格式
UPDATE events
SET team_event_config = JSON_OBJECT(
  'projects', JSON_OBJECT(
    'men_singles', JSON_OBJECT('enabled', true, 'count', FLOOR(IFNULL(singles_player_count, 3) / 2)),
    'women_singles', JSON_OBJECT('enabled', true, 'count', CEIL(IFNULL(singles_player_count, 3) / 2)),
    'men_doubles', JSON_OBJECT('enabled', false, 'count', 0),
    'women_doubles', JSON_OBJECT('enabled', false, 'count', 0),
    'mixed_doubles', JSON_OBJECT('enabled', false, 'count', 0)
  )
)
WHERE event_type = 'team' AND team_event_config IS NULL;
