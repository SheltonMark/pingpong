-- 组队邀请表（双打/团体赛）
CREATE TABLE IF NOT EXISTS team_invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_id INT NOT NULL,
  inviter_id INT NOT NULL,
  invitee_id INT NOT NULL,
  type ENUM('doubles', 'team') NOT NULL,
  message VARCHAR(200),
  status ENUM('pending', 'accepted', 'rejected', 'expired') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (inviter_id) REFERENCES users(id),
  FOREIGN KEY (invitee_id) REFERENCES users(id),
  INDEX idx_invitee_status (invitee_id, status),
  INDEX idx_inviter (inviter_id)
);
