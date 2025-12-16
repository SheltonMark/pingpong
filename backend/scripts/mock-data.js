const mysql = require('mysql2/promise');

async function insertMockData() {
  const connection = await mysql.createConnection({
    host: 'sh-cynosdbmysql-grp-13i98w58.sql.tencentcdb.com',
    port: 23262,
    user: 'root',
    password: 'd6jpFcBF',
    database: 'pingpong'
  });

  try {
    console.log('🔄 Inserting mock data...');

    // Get school id
    const [schools] = await connection.query('SELECT id, name FROM schools LIMIT 1');
    let schoolId = schools[0]?.id;

    if (!schoolId) {
      // Create a school first
      await connection.query(
        "INSERT INTO schools (name, short_name, status) VALUES ('浙江工业大学', '浙工大', 'active')"
      );
      const [newSchool] = await connection.query('SELECT LAST_INSERT_ID() as id');
      schoolId = newSchool[0].id;
      console.log('✅ Created school: 浙江工业大学');
    } else {
      console.log(`Found school: ${schools[0].name}`);
    }

    // Get or create users
    let [users] = await connection.query('SELECT id, name FROM users LIMIT 5');

    if (users.length === 0) {
      console.log('Creating mock users...');
      const mockUsers = [
        { name: '李思源', gender: 'male', phone: '13800000001', user_type: 'student', openid: 'mock_openid_001' },
        { name: '王老师', gender: 'male', phone: '13800000002', user_type: 'teacher', openid: 'mock_openid_002' },
        { name: '陈雨婷', gender: 'female', phone: '13800000003', user_type: 'student', openid: 'mock_openid_003' },
        { name: '张明远', gender: 'male', phone: '13800000004', user_type: 'student', openid: 'mock_openid_004' },
        { name: '刘大伟', gender: 'male', phone: '13800000005', user_type: 'student', openid: 'mock_openid_005' }
      ];

      for (const user of mockUsers) {
        await connection.query(
          `INSERT INTO users (openid, name, gender, phone, user_type, school_id, is_registered, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
          [user.openid, user.name, user.gender, user.phone, user.user_type, schoolId]
        );
        console.log(`✅ Created user: ${user.name}`);
      }

      [users] = await connection.query('SELECT id, name FROM users LIMIT 5');
    }

    console.log(`Found ${users.length} users`);

    // Mock posts
    const postsData = [
      {
        content: '今天下午有人想来体育馆打球吗？我在3号台，想找人练练反手！',
        like_count: 12,
        comment_count: 5
      },
      {
        content: '🏆 恭喜张明远同学在校联赛中获得冠军！这是他连续第三年夺冠。希望其他同学向他学习，下学期还有更多赛事等着大家！',
        like_count: 48,
        comment_count: 16
      },
      {
        content: '刚学会拉弧圈球，感觉手感还不太稳定，有没有大佬愿意指导一下新手 🙏',
        like_count: 8,
        comment_count: 12
      },
      {
        content: '今天和李思源打了一场，3:2险胜！最后一局太紧张了，差点被翻盘。',
        like_count: 23,
        comment_count: 8
      },
      {
        content: '新买的蝴蝶王手感真不错，发球旋转明显强了很多，推荐给大家！',
        like_count: 15,
        comment_count: 6
      }
    ];

    for (let i = 0; i < postsData.length; i++) {
      const userId = users[i % users.length].id;
      const post = postsData[i];

      // Check if post already exists
      const [existing] = await connection.query(
        'SELECT id FROM posts WHERE user_id = ? AND content = ?',
        [userId, post.content]
      );

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO posts (user_id, content, school_id, like_count, comment_count, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'active', DATE_SUB(NOW(), INTERVAL ? HOUR))`,
          [userId, post.content, schoolId, post.like_count, post.comment_count, i * 2]
        );
        console.log(`✅ Added post: "${post.content.substring(0, 30)}..."`);
      } else {
        console.log(`⏭️ Post already exists: "${post.content.substring(0, 30)}..."`);
      }
    }

    // Get created posts
    const [posts] = await connection.query('SELECT id, user_id FROM posts ORDER BY id DESC LIMIT 5');

    // Mock comments
    const commentsData = [
      '太厉害了！',
      '什么时候一起打球？',
      '我也想学弧圈球',
      '恭喜恭喜！',
      '下次带我一个',
      '加油！',
      '这个技术教程在哪里学的？',
      '新手求带'
    ];

    for (const post of posts) {
      const numComments = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numComments; i++) {
        const userId = users[Math.floor(Math.random() * users.length)].id;
        const content = commentsData[Math.floor(Math.random() * commentsData.length)];

        const [existing] = await connection.query(
          'SELECT id FROM comments WHERE post_id = ? AND user_id = ? AND content = ?',
          [post.id, userId, content]
        );

        if (existing.length === 0) {
          await connection.query(
            `INSERT INTO comments (post_id, user_id, content, created_at)
             VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
            [post.id, userId, content, Math.floor(Math.random() * 60)]
          );
        }
      }
    }
    console.log('✅ Added comments');

    // Mock likes
    for (const post of posts) {
      const numLikes = Math.floor(Math.random() * users.length) + 1;
      const shuffledUsers = [...users].sort(() => Math.random() - 0.5);

      for (let i = 0; i < numLikes && i < shuffledUsers.length; i++) {
        const userId = shuffledUsers[i].id;

        const [existing] = await connection.query(
          'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
          [post.id, userId]
        );

        if (existing.length === 0) {
          await connection.query(
            'INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
            [post.id, userId]
          );
        }
      }
    }
    console.log('✅ Added likes');

    // Mock invitations
    const invitationsData = [
      {
        title: '周末约球',
        location: '紫金港体育馆 3号台',
        scheduled_time: 'DATE_ADD(NOW(), INTERVAL 2 DAY)',
        max_participants: 2,
        status: 'open'
      },
      {
        title: '练习赛找人',
        location: '紫金港体育馆 5号台',
        scheduled_time: 'DATE_ADD(NOW(), INTERVAL 1 DAY)',
        max_participants: 4,
        status: 'open'
      },
      {
        title: '新手友谊赛',
        location: '玉泉校区体育馆',
        scheduled_time: 'DATE_ADD(NOW(), INTERVAL 3 DAY)',
        max_participants: 2,
        status: 'full'
      }
    ];

    for (let i = 0; i < invitationsData.length; i++) {
      const userId = users[i % users.length].id;
      const inv = invitationsData[i];

      const [existing] = await connection.query(
        'SELECT id FROM match_invitations WHERE creator_id = ? AND title = ?',
        [userId, inv.title]
      );

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO match_invitations (creator_id, title, location, scheduled_time, max_participants, status, school_id, created_at)
           VALUES (?, ?, ?, ${inv.scheduled_time}, ?, ?, ?, NOW())`,
          [userId, inv.title, inv.location, inv.max_participants, inv.status, schoolId]
        );

        // Get the invitation id
        const [newInv] = await connection.query('SELECT LAST_INSERT_ID() as id');
        const invId = newInv[0].id;

        // Add creator as participant
        await connection.query(
          'INSERT INTO invitation_participants (invitation_id, user_id) VALUES (?, ?)',
          [invId, userId]
        );

        // Add more participants for 'full' status
        if (inv.status === 'full' && users.length > 1) {
          const otherId = users[(i + 1) % users.length].id;
          await connection.query(
            'INSERT INTO invitation_participants (invitation_id, user_id) VALUES (?, ?)',
            [invId, otherId]
          );
        }

        console.log(`✅ Added invitation: "${inv.title}"`);
      } else {
        console.log(`⏭️ Invitation already exists: "${inv.title}"`);
      }
    }

    // Mock rankings data
    console.log('\n📊 Adding rankings data...');
    const rankingsData = [
      { name: '张明远', points: 2850, wins: 28, losses: 5 },
      { name: '李思源', points: 2720, wins: 24, losses: 8 },
      { name: '王老师', points: 2650, wins: 22, losses: 10 },
      { name: '陈雨婷', points: 2580, wins: 20, losses: 12 },
      { name: '刘大伟', points: 2490, wins: 18, losses: 14 },
    ];

    // Update users with points
    for (let i = 0; i < users.length && i < rankingsData.length; i++) {
      const userData = rankingsData[i];
      await connection.query(
        'UPDATE users SET points = ?, wins = ?, losses = ? WHERE id = ?',
        [userData.points, userData.wins, userData.losses, users[i].id]
      );
      console.log(`  ✅ Updated ${users[i].name}: ${userData.points}分`);
    }

    // Mock matches (比赛记录)
    console.log('\n🏓 Adding match history...');

    // First create a mock event for practice matches
    let eventId;
    const [existingEvent] = await connection.query(
      "SELECT id FROM events WHERE title = '练习赛记录'"
    );
    if (existingEvent.length > 0) {
      eventId = existingEvent[0].id;
    } else {
      await connection.query(
        `INSERT INTO events (title, description, event_type, event_format, scope, school_id, status, created_by, created_at)
         VALUES ('练习赛记录', '日常练习赛', 'singles', 'round_robin', 'school', ?, 'finished', ?, NOW())`,
        [schoolId, users[0].id]
      );
      const [newEvent] = await connection.query('SELECT LAST_INSERT_ID() as id');
      eventId = newEvent[0].id;
      console.log('  ✅ Created practice event');
    }

    const matchesData = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        // 随机生成几场比赛
        const numMatches = Math.floor(Math.random() * 3) + 1;
        for (let k = 0; k < numMatches; k++) {
          const winner = Math.random() > 0.5 ? i : j;
          const loser = winner === i ? j : i;
          const winnerGames = 3;
          const loserGames = Math.floor(Math.random() * 3);
          matchesData.push({
            player1_id: users[winner].id,
            player2_id: users[loser].id,
            player1_games: winnerGames,
            player2_games: loserGames,
            winner_id: users[winner].id
          });
        }
      }
    }

    for (const match of matchesData) {
      await connection.query(
        `INSERT INTO matches (event_id, player1_id, player2_id, player1_games, player2_games, winner_id, status, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'finished', DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 60) DAY), NOW())`,
        [eventId, match.player1_id, match.player2_id, match.player1_games, match.player2_games, match.winner_id]
      );
    }
    console.log(`  ✅ Added ${matchesData.length} matches`);

    console.log('\n🎉 Mock data inserted successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

insertMockData();
