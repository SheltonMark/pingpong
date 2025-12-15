// backend/routes/invitations.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 发起约球
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      user_id, title, description, location,
      scheduled_time, max_participants, school_id,
      allow_cross_school, post_content, post_images
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    await connection.beginTransaction();

    let postId = null;

    // 如果有帖子内容，先创建帖子
    if (post_content) {
      const [postResult] = await connection.execute(
        'INSERT INTO posts (user_id, content, school_id) VALUES (?, ?, ?)',
        [user_id, post_content.substring(0, 150), school_id || null]
      );
      postId = postResult.insertId;

      // 插入帖子图片
      if (post_images && post_images.length > 0) {
        for (let i = 0; i < Math.min(post_images.length, 9); i++) {
          await connection.execute(
            'INSERT INTO post_images (post_id, image_url, sort_order) VALUES (?, ?, ?)',
            [postId, post_images[i], i]
          );
        }
      }
    }

    // 创建约球
    const [result] = await connection.execute(
      `INSERT INTO match_invitations
        (post_id, creator_id, title, description, location, scheduled_time, max_participants, school_id, allow_cross_school)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postId, user_id, title || '约球',
        description || null, location || null,
        scheduled_time || null, max_participants || 2,
        school_id || null, allow_cross_school !== false ? 1 : 0
      ]
    );
    const invitationId = result.insertId;

    // 创建者自动加入
    await connection.execute(
      'INSERT INTO invitation_participants (invitation_id, user_id, status, confirmed_at) VALUES (?, ?, "confirmed", NOW())',
      [invitationId, user_id]
    );

    await connection.commit();

    res.json({
      success: true,
      data: { invitation_id: invitationId, post_id: postId }
    });
  } catch (error) {
    await connection.rollback();
    console.error('发起约球失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  } finally {
    connection.release();
  }
});

// 获取约球列表
router.get('/', async (req, res) => {
  try {
    const { school_id, status, user_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT mi.*,
        u.name as creator_name, u.avatar_url as creator_avatar,
        s.name as school_name,
        (SELECT COUNT(*) FROM invitation_participants WHERE invitation_id = mi.id AND status = 'confirmed') as participant_count
      FROM match_invitations mi
      JOIN users u ON mi.creator_id = u.id
      LEFT JOIN schools s ON mi.school_id = s.id
      WHERE mi.status != 'cancelled'
    `;
    const params = [];

    if (school_id) {
      sql += ' AND (mi.school_id = ? OR mi.allow_cross_school = 1)';
      params.push(school_id);
    }
    if (status) {
      sql += ' AND mi.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY mi.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [invitations] = await pool.query(sql, params);

    // 检查当前用户是否已参与
    if (user_id) {
      for (const inv of invitations) {
        const [participated] = await pool.query(
          'SELECT status FROM invitation_participants WHERE invitation_id = ? AND user_id = ?',
          [inv.id, user_id]
        );
        inv.user_status = participated.length > 0 ? participated[0].status : null;
      }
    }

    res.json({
      success: true,
      data: {
        list: invitations,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取约球列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取约球详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [invitations] = await pool.query(`
      SELECT mi.*,
        u.name as creator_name, u.avatar_url as creator_avatar,
        s.name as school_name
      FROM match_invitations mi
      JOIN users u ON mi.creator_id = u.id
      LEFT JOIN schools s ON mi.school_id = s.id
      WHERE mi.id = ?
    `, [id]);

    if (invitations.length === 0) {
      return res.status(404).json({ success: false, message: '约球不存在' });
    }

    const invitation = invitations[0];

    // 获取参与者
    const [participants] = await pool.query(`
      SELECT ip.*, u.name, u.avatar_url, ip.user_id
      FROM invitation_participants ip
      JOIN users u ON ip.user_id = u.id
      WHERE ip.invitation_id = ?
      ORDER BY ip.joined_at
    `, [id]);

    invitation.participants = participants;

    // 获取关联帖子内容
    if (invitation.post_id) {
      const [posts] = await pool.query(
        'SELECT content FROM posts WHERE id = ?',
        [invitation.post_id]
      );
      if (posts.length > 0) {
        invitation.post_content = posts[0].content;
      }
    }

    res.json({ success: true, data: invitation });
  } catch (error) {
    console.error('获取约球详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 参与约球
router.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查约球是否存在且开放
    const [invitations] = await pool.query(
      'SELECT * FROM match_invitations WHERE id = ? AND status = "open"',
      [id]
    );

    if (invitations.length === 0) {
      return res.status(400).json({ success: false, message: '约球不存在或已关闭' });
    }

    const invitation = invitations[0];

    // 检查是否已参与
    const [existing] = await pool.query(
      'SELECT id FROM invitation_participants WHERE invitation_id = ? AND user_id = ?',
      [id, user_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '已参与此约球' });
    }

    // 检查是否已满
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as count FROM invitation_participants WHERE invitation_id = ? AND status = "confirmed"',
      [id]
    );

    if (countResult[0].count >= invitation.max_participants) {
      return res.status(400).json({ success: false, message: '约球已满员' });
    }

    // 加入
    await pool.execute(
      'INSERT INTO invitation_participants (invitation_id, user_id, status, confirmed_at) VALUES (?, ?, "confirmed", NOW())',
      [id, user_id]
    );

    // 检查是否满员，更新状态
    const [newCount] = await pool.query(
      'SELECT COUNT(*) as count FROM invitation_participants WHERE invitation_id = ? AND status = "confirmed"',
      [id]
    );

    if (newCount[0].count >= invitation.max_participants) {
      await pool.execute(
        'UPDATE match_invitations SET status = "full" WHERE id = ?',
        [id]
      );
    }

    res.json({ success: true, message: '已加入约球' });
  } catch (error) {
    console.error('参与约球失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 退出约球
router.post('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 检查是否是创建者
    const [invitations] = await pool.query(
      'SELECT creator_id, status FROM match_invitations WHERE id = ?',
      [id]
    );

    if (invitations.length === 0) {
      return res.status(404).json({ success: false, message: '约球不存在' });
    }

    if (invitations[0].creator_id === parseInt(user_id)) {
      return res.status(400).json({ success: false, message: '创建者不能退出' });
    }

    if (invitations[0].status === 'ongoing' || invitations[0].status === 'finished') {
      return res.status(400).json({ success: false, message: '比赛已开始，无法退出' });
    }

    await pool.execute(
      'DELETE FROM invitation_participants WHERE invitation_id = ? AND user_id = ?',
      [id, user_id]
    );

    // 如果状态是满员，改回开放
    await pool.execute(
      'UPDATE match_invitations SET status = "open" WHERE id = ? AND status = "full"',
      [id]
    );

    res.json({ success: true, message: '已退出约球' });
  } catch (error) {
    console.error('退出约球失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 开始约球比赛
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 验证是创建者
    const [invitations] = await pool.query(
      'SELECT * FROM match_invitations WHERE id = ? AND creator_id = ?',
      [id, user_id]
    );

    if (invitations.length === 0) {
      return res.status(403).json({ success: false, message: '只有创建者可以开始比赛' });
    }

    const invitation = invitations[0];

    if (invitation.status !== 'open' && invitation.status !== 'full') {
      return res.status(400).json({ success: false, message: '约球状态不允许开始比赛' });
    }

    // 获取参与者
    const [participants] = await pool.query(
      'SELECT user_id FROM invitation_participants WHERE invitation_id = ? AND status = "confirmed" ORDER BY joined_at',
      [id]
    );

    if (participants.length < 2) {
      return res.status(400).json({ success: false, message: '至少需要2人才能开始' });
    }

    // 创建比赛记录
    const [result] = await pool.execute(
      `INSERT INTO matches (invitation_id, player1_id, player2_id, status, started_at)
       VALUES (?, ?, ?, 'ongoing', NOW())`,
      [id, participants[0].user_id, participants[1].user_id]
    );

    // 更新约球状态
    await pool.execute(
      'UPDATE match_invitations SET status = "ongoing" WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: { match_id: result.insertId }
    });
  } catch (error) {
    console.error('开始约球失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取约球比赛
router.get('/:id/match', async (req, res) => {
  try {
    const { id } = req.params;

    const [matches] = await pool.query(`
      SELECT m.*,
        u1.name as player1_name, u1.avatar_url as player1_avatar,
        u2.name as player2_name, u2.avatar_url as player2_avatar
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      WHERE m.invitation_id = ?
    `, [id]);

    if (matches.length === 0) {
      return res.json({ success: true, data: null });
    }

    const match = matches[0];

    // 获取比分
    const [scores] = await pool.query(
      'SELECT * FROM match_scores WHERE match_id = ? ORDER BY game_number',
      [match.id]
    );
    match.scores = scores;

    res.json({ success: true, data: match });
  } catch (error) {
    console.error('获取约球比赛失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 完成约球比赛
router.post('/:id/finish', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 验证是创建者
    const [invitations] = await pool.query(
      'SELECT creator_id FROM match_invitations WHERE id = ?',
      [id]
    );

    if (invitations.length === 0 || invitations[0].creator_id !== parseInt(user_id)) {
      return res.status(403).json({ success: false, message: '只有创建者可以结束比赛' });
    }

    // 更新约球状态
    await pool.execute(
      'UPDATE match_invitations SET status = "finished" WHERE id = ?',
      [id]
    );

    // 更新比赛状态
    await pool.execute(
      'UPDATE matches SET status = "finished", finished_at = NOW() WHERE invitation_id = ?',
      [id]
    );

    res.json({ success: true, message: '比赛已结束' });
  } catch (error) {
    console.error('结束约球失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
