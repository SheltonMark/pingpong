-- 签到点表
CREATE TABLE IF NOT EXISTS check_in_points (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius INT DEFAULT 100,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 签到记录表
CREATE TABLE IF NOT EXISTS check_ins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  point_id INT NOT NULL,
  check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  distance INT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (point_id) REFERENCES check_in_points(id),
  INDEX idx_user_time (user_id, check_in_time)
);
