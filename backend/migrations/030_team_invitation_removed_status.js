module.exports = {
  async up(pool) {
    await pool.execute(
      "ALTER TABLE team_invitations MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired', 'removed') DEFAULT 'pending'"
    );
  }
};
