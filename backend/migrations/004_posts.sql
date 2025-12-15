-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '发帖用户',
  content VARCHAR(150) NOT NULL COMMENT '内容(限150字)',
  school_id INT COMMENT '所属学校',

  -- 统计
  like_count INT DEFAULT 0 COMMENT '点赞数',
  comment_count INT DEFAULT 0 COMMENT '评论数',

  -- 状态
  status ENUM('active', 'deleted', 'hidden') DEFAULT 'active',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user (user_id),
  INDEX idx_school (school_id),
  INDEX idx_created (created_at DESC),
  INDEX idx_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='帖子表';

-- 帖子图片表
CREATE TABLE IF NOT EXISTS post_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL COMMENT '图片URL',
  sort_order INT DEFAULT 0 COMMENT '排序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_post (post_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='帖子图片表';

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL COMMENT '帖子ID',
  user_id INT NOT NULL COMMENT '评论用户',
  content VARCHAR(500) NOT NULL COMMENT '评论内容',
  parent_id INT COMMENT '父评论ID(回复)',

  -- 状态
  status ENUM('active', 'deleted') DEFAULT 'active',

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_post (post_id),
  INDEX idx_user (user_id),
  INDEX idx_parent (parent_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论表';

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_user_post (user_id, post_id),
  INDEX idx_post (post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞表';
