-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(64) UNIQUE NOT NULL COMMENT '微信openid',
  union_id VARCHAR(64) COMMENT '微信unionid',

  -- 基本信息
  name VARCHAR(50) COMMENT '姓名',
  gender ENUM('male', 'female') COMMENT '性别',
  phone VARCHAR(20) COMMENT '手机号',
  avatar_url VARCHAR(500) COMMENT '头像URL',

  -- 用户类型：student(在校生), graduate(毕业生), teacher(老师), staff(教职工)
  user_type ENUM('student', 'graduate', 'teacher', 'staff') COMMENT '用户类型',

  -- 学校相关
  school_id INT COMMENT '学校ID',
  college_id INT COMMENT '学院ID',
  department_id INT COMMENT '下属单位ID（教职工）',
  class_name VARCHAR(50) COMMENT '班级（在校生）',
  enrollment_year INT COMMENT '入学年份',

  -- 积分和排名
  points INT DEFAULT 0 COMMENT '积分',
  wins INT DEFAULT 0 COMMENT '胜场',
  losses INT DEFAULT 0 COMMENT '负场',

  -- 状态
  is_registered TINYINT(1) DEFAULT 0 COMMENT '是否已完成注册',
  privacy_agreed TINYINT(1) DEFAULT 0 COMMENT '是否同意隐私政策',
  privacy_agreed_at DATETIME COMMENT '同意隐私政策时间',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_school (school_id),
  INDEX idx_points (points DESC),
  INDEX idx_user_type (user_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '角色名称',
  code VARCHAR(50) UNIQUE NOT NULL COMMENT '角色代码',
  description VARCHAR(200) COMMENT '描述',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 用户角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  school_id INT COMMENT '角色生效的学校（学校管理员）',
  event_id INT COMMENT '角色生效的赛事（赛事管理员/领队）',
  granted_by INT COMMENT '授权人',
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME COMMENT '过期时间',

  UNIQUE KEY uk_user_role_scope (user_id, role_id, school_id, event_id),
  INDEX idx_user (user_id),
  INDEX idx_role (role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- 插入预设角色
INSERT INTO roles (name, code, description) VALUES
('总管理员', 'super_admin', '管理所有学校、创建校际赛事'),
('学校管理员', 'school_admin', '管理本校、创建校内赛事'),
('长期赛事管理员', 'event_manager', '自主发起和管理赛事'),
('赛事管理员', 'event_admin', '管理指定赛事'),
('领队', 'team_leader', '团体赛组队'),
('普通用户', 'user', '报名、约球等')
ON DUPLICATE KEY UPDATE name = VALUES(name);
