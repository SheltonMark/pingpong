// backend/routes/posts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 发布帖子
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { user_id, content, images, school_id } = req.body;

    // 验证
    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: '内容不能为空' });
    }
    if (content.length > 150) {
      return res.status(400).json({ success: false, message: '内容不能超过150字' });
    }
    if (images && images.length > 9) {
      return res.status(400).json({ success: false, message: '最多上传9张图片' });
    }

    await connection.beginTransaction();

    // 插入帖子
    const [result] = await connection.execute(
      'INSERT INTO posts (user_id, content, school_id) VALUES (?, ?, ?)',
      [user_id, content.trim(), school_id || null]
    );
    const postId = result.insertId;

    // 插入图片
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        await connection.execute(
          'INSERT INTO post_images (post_id, image_url, sort_order) VALUES (?, ?, ?)',
          [postId, images[i], i]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      data: { post_id: postId }
    });
  } catch (error) {
    await connection.rollback();
    console.error('发布帖子失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  } finally {
    connection.release();
  }
});

// 获取帖子列表
router.get('/', async (req, res) => {
  try {
    const { school_id, user_id, post_type, current_user_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT p.*, p.user_id as author_id,
        COALESCE(u.name, '已注销用户') as author_name,
        u.avatar_url as author_avatar,
        s.name as school_name,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND status = 'active') as comment_count,
        mi.id as invitation_id
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN schools s ON p.school_id = s.id
      LEFT JOIN match_invitations mi ON mi.post_id = p.id
      WHERE p.status = 'active'
    `;
    const params = [];

    if (school_id) {
      sql += ' AND p.school_id = ?';
      params.push(school_id);
    }

    if (user_id) {
      sql += ' AND p.user_id = ?';
      params.push(user_id);
    }

    // 帖子类型筛选
    if (post_type === 'invitation') {
      sql += ' AND mi.id IS NOT NULL';
    } else if (post_type === 'post') {
      sql += ' AND mi.id IS NULL';
    }

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [posts] = await pool.query(sql, params);

    // 获取每个帖子的图片和关联的约球信息
    for (const post of posts) {
      const [images] = await pool.query(
        'SELECT image_url FROM post_images WHERE post_id = ? ORDER BY sort_order',
        [post.id]
      );
      post.images = images.map(img => img.image_url);

      // 检查是否有关联的约球
      const [invitations] = await pool.query(`
        SELECT mi.id, mi.title, mi.location, mi.scheduled_time, mi.max_participants, mi.status,
          (SELECT COUNT(*) FROM invitation_participants WHERE invitation_id = mi.id AND status = 'confirmed') as participant_count
        FROM match_invitations mi
        WHERE mi.post_id = ?
      `, [post.id]);
      if (invitations.length > 0) {
        post.invitation = invitations[0];
      }

      // 检查当前用户是否已点赞
      const likeUserId = current_user_id || user_id;
      if (likeUserId) {
        const [liked] = await pool.query(
          'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
          [post.id, likeUserId]
        );
        post.is_liked = liked.length > 0;
      } else {
        post.is_liked = false;
      }
    }

    // 获取总数
    let countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM posts p
      LEFT JOIN match_invitations mi ON mi.post_id = p.id
      WHERE p.status = 'active'
    `;
    const countParams = [];
    if (school_id) {
      countSql += ' AND p.school_id = ?';
      countParams.push(school_id);
    }
    if (post_type === 'invitation') {
      countSql += ' AND mi.id IS NOT NULL';
    } else if (post_type === 'post') {
      countSql += ' AND mi.id IS NULL';
    }
    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      success: true,
      data: {
        list: posts,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取帖子列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取帖子详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    const [posts] = await pool.query(`
      SELECT p.*, p.user_id as author_id,
        COALESCE(u.name, '已注销用户') as author_name,
        u.avatar_url as author_avatar,
        s.name as school_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN schools s ON p.school_id = s.id
      WHERE p.id = ? AND p.status = 'active'
    `, [id]);

    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: '帖子不存在' });
    }

    const post = posts[0];

    // 获取图片
    const [images] = await pool.query(
      'SELECT image_url FROM post_images WHERE post_id = ? ORDER BY sort_order',
      [id]
    );
    post.images = images.map(img => img.image_url);

    // 获取点赞数
    const [likeCount] = await pool.query(
      'SELECT COUNT(*) as count FROM likes WHERE post_id = ?',
      [id]
    );
    post.like_count = likeCount[0].count;

    // 检查是否已点赞
    if (user_id) {
      const [liked] = await pool.query(
        'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
        [id, user_id]
      );
      post.is_liked = liked.length > 0;
    }

    res.json({ success: true, data: post });
  } catch (error) {
    console.error('获取帖子详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除帖子
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 验证是否是作者
    const [posts] = await pool.query(
      'SELECT user_id FROM posts WHERE id = ?',
      [id]
    );

    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: '帖子不存在' });
    }

    if (posts[0].user_id !== parseInt(user_id)) {
      return res.status(403).json({ success: false, message: '无权删除此帖子' });
    }

    await pool.execute(
      'UPDATE posts SET status = "deleted" WHERE id = ?',
      [id]
    );

    res.json({ success: true, message: '已删除' });
  } catch (error) {
    console.error('删除帖子失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============ 评论相关 ============

// 获取帖子评论
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [comments] = await pool.query(`
      SELECT c.*, c.user_id as author_id,
        COALESCE(u.name, '已注销用户') as author_name,
        u.avatar_url as author_avatar,
        pu.name as reply_to_name
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN comments pc ON c.parent_id = pc.id
      LEFT JOIN users pu ON pc.user_id = pu.id
      WHERE c.post_id = ? AND c.status = 'active'
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), parseInt(offset)]);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM comments WHERE post_id = ? AND status = "active"',
      [id]
    );

    res.json({
      success: true,
      data: {
        list: comments,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取评论失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 发表评论
router.post('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, content, parent_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: '评论内容不能为空' });
    }
    if (content.length > 500) {
      return res.status(400).json({ success: false, message: '评论不能超过500字' });
    }

    // 检查帖子是否存在
    const [posts] = await pool.query(
      'SELECT id FROM posts WHERE id = ? AND status = "active"',
      [id]
    );
    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: '帖子不存在' });
    }

    const [result] = await pool.execute(
      'INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
      [id, user_id, content.trim(), parent_id || null]
    );

    // 更新帖子评论数
    await pool.execute(
      'UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: { comment_id: result.insertId }
    });
  } catch (error) {
    console.error('发表评论失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除评论
router.delete('/:postId/comments/:commentId', async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { user_id } = req.body;

    const [comments] = await pool.query(
      'SELECT user_id FROM comments WHERE id = ? AND post_id = ?',
      [commentId, postId]
    );

    if (comments.length === 0) {
      return res.status(404).json({ success: false, message: '评论不存在' });
    }

    if (comments[0].user_id !== parseInt(user_id)) {
      return res.status(403).json({ success: false, message: '无权删除此评论' });
    }

    await pool.execute(
      'UPDATE comments SET status = "deleted" WHERE id = ?',
      [commentId]
    );

    // 更新帖子评论数
    await pool.execute(
      'UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?',
      [postId]
    );

    res.json({ success: true, message: '已删除' });
  } catch (error) {
    console.error('删除评论失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============ 点赞相关 ============

// 点赞/取消点赞
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查帖子是否存在
    const [posts] = await pool.query(
      'SELECT id FROM posts WHERE id = ? AND status = "active"',
      [id]
    );
    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: '帖子不存在' });
    }

    // 检查是否已点赞
    const [existing] = await pool.query(
      'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
      [id, user_id]
    );

    let isLiked;
    if (existing.length > 0) {
      // 取消点赞
      await pool.execute(
        'DELETE FROM likes WHERE post_id = ? AND user_id = ?',
        [id, user_id]
      );
      await pool.execute(
        'UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?',
        [id]
      );
      isLiked = false;
    } else {
      // 点赞
      await pool.execute(
        'INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
        [id, user_id]
      );
      await pool.execute(
        'UPDATE posts SET like_count = like_count + 1 WHERE id = ?',
        [id]
      );
      isLiked = true;
    }

    // 获取最新点赞数
    const [likeCount] = await pool.query(
      'SELECT COUNT(*) as count FROM likes WHERE post_id = ?',
      [id]
    );

    res.json({
      success: true,
      data: {
        is_liked: isLiked,
        like_count: likeCount[0].count
      }
    });
  } catch (error) {
    console.error('点赞操作失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
