-- 学校表
CREATE TABLE IF NOT EXISTS schools (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '学校名称',
  short_name VARCHAR(20) COMMENT '简称',
  logo_url VARCHAR(500) COMMENT 'Logo URL',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学校表';

-- 学院表
CREATE TABLE IF NOT EXISTS colleges (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '学院名称',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_school (school_id),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学院表';

-- 下属单位表（教职工用）
CREATE TABLE IF NOT EXISTS departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '单位名称',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_school (school_id),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下属单位表';

-- 添加外键到 users 表
ALTER TABLE users
  ADD CONSTRAINT fk_user_school FOREIGN KEY (school_id) REFERENCES schools(id),
  ADD CONSTRAINT fk_user_college FOREIGN KEY (college_id) REFERENCES colleges(id),
  ADD CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES departments(id);

-- 插入初始数据：浙江工业大学
INSERT INTO schools (name, short_name) VALUES
('浙江工业大学', '浙工大'),
('浙江大学', '浙大'),
('复旦大学', '复旦'),
('上海交通大学', '上交')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 浙工大学院
INSERT INTO colleges (school_id, name) VALUES
(1, '体育军训部'),
(1, '计算机科学与技术学院'),
(1, '机械工程学院'),
(1, '信息工程学院'),
(1, '建筑工程学院'),
(1, '化学工程学院'),
(1, '生物工程学院'),
(1, '材料科学与工程学院'),
(1, '经贸管理学院'),
(1, '理学院'),
(1, '人文学院'),
(1, '外国语学院'),
(1, '设计与建筑学院'),
(1, '国际学院')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 浙工大下属单位
INSERT INTO departments (school_id, name) VALUES
(1, '后勤服务中心'),
(1, '教务处'),
(1, '学生处'),
(1, '图书馆'),
(1, '网络中心'),
(1, '保卫处'),
(1, '校医院')
ON DUPLICATE KEY UPDATE name = VALUES(name);
