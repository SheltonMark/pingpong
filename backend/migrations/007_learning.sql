-- 学习资料表
CREATE TABLE IF NOT EXISTS learning_materials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  type ENUM('video', 'ppt', 'document') NOT NULL,
  url VARCHAR(500) NOT NULL,
  cover_url VARCHAR(500),
  duration VARCHAR(20),
  author VARCHAR(100),
  view_count INT DEFAULT 0,
  school_id INT,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_type (type),
  INDEX idx_school (school_id)
);
