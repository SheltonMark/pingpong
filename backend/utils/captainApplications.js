const { parseDateTimeValue } = require('./china-time');

class CaptainApplicationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isBeforeEventStart(application, now = new Date()) {
  if (!['draft', 'registration'].includes(application.event_status)) return false;
  if (Number(application.has_started_match)) return false;
  for (const value of [application.event_start, application.event_end]) {
    if (!value) continue;
    const time = parseDateTimeValue(value);
    if (!time || time <= now) return false;
  }
  return true;
}

function canCancelCaptainApplication(application, now = new Date()) {
  return ['pending', 'approved', 'rejected'].includes(application.status)
    && isBeforeEventStart(application, now);
}

async function lockApprovedCaptain(connection, eventId, userId) {
  const [rows] = await connection.query(
    'SELECT status FROM captain_applications WHERE event_id = ? AND user_id = ? FOR UPDATE',
    [eventId, userId]
  );
  if (rows[0]?.status !== 'approved') {
    throw new CaptainApplicationError('领队资格已失效，请刷新后重试', 403);
  }
}

async function withApprovedCaptain(pool, eventId, userId, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockApprovedCaptain(connection, eventId, userId);
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function withPreStartEvent(pool, eventId, userId, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Match cancellation's application -> event -> matches lock order.
    await connection.query(
      'SELECT id FROM captain_applications WHERE event_id = ? AND user_id = ? FOR UPDATE', [eventId, userId]
    );
    const [[event]] = await connection.query('SELECT * FROM events WHERE id = ? FOR UPDATE', [eventId]);
    if (!event) throw new CaptainApplicationError('赛事不存在', 404);
    const [matches] = await connection.query('SELECT id, status FROM matches WHERE event_id = ? FOR UPDATE', [eventId]);
    if (!isBeforeEventStart({ ...event, event_status: event.status,
      has_started_match: matches.some(match => ['ongoing', 'pending_confirm', 'finished'].includes(match.status)) ? 1 : 0 })) {
      throw new CaptainApplicationError('比赛已开始、已结束或已取消，不能申请领队');
    }
    const result = await work(connection, event);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancelCaptainApplication({ applicationId, adminUserId, adminContext, now }, pool) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[application]] = await connection.execute(`
      SELECT ca.*, e.school_id AS event_school_id, e.status AS event_status,
             e.event_start, e.event_end
      FROM captain_applications ca
      JOIN events e ON e.id = ca.event_id
      WHERE ca.id = ?
      FOR UPDATE`, [applicationId]);
    if (!application) throw new CaptainApplicationError('申请不存在', 404);
    const allowed = adminContext?.isSuperAdmin || (adminContext?.isSchoolAdmin
      && adminContext.managedSchoolIds?.some(id => Number(id) === Number(application.event_school_id)));
    if (!allowed) throw new CaptainApplicationError('您只能取消本校赛事的领队申请', 403);

    // Lock scheduled matches too, so a match cannot start during cancellation.
    const [matches] = await connection.execute(
      'SELECT id, status FROM matches WHERE event_id = ? FOR UPDATE', [application.event_id]
    );
    application.has_started_match = matches.some(match => ['ongoing', 'pending_confirm', 'finished'].includes(match.status)) ? 1 : 0;
    if (!isBeforeEventStart(application, now || new Date())) {
      throw new CaptainApplicationError('比赛已开始、已结束或已取消，不能取消领队申请');
    }
    if (application.status === 'cancelled') {
      await connection.commit();
      return;
    }
    if (!canCancelCaptainApplication(application, now || new Date())) {
      throw new CaptainApplicationError('当前申请状态不能取消');
    }
    const [result] = await connection.execute(`
      UPDATE captain_applications ca
      JOIN events e ON e.id = ca.event_id
      SET ca.status = 'cancelled', ca.cancelled_by = ?, ca.cancelled_at = NOW()
      WHERE ca.id = ? AND ca.status IN ('pending', 'approved', 'rejected')
        AND e.status IN ('draft', 'registration')
        AND (e.event_start IS NULL OR e.event_start > NOW())
        AND (e.event_end IS NULL OR e.event_end > NOW())`, [adminUserId, applicationId]);
    if (result.affectedRows !== 1) {
      throw new CaptainApplicationError('赛事或申请状态已变化，请刷新后重试', 409);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { CaptainApplicationError, isBeforeEventStart, canCancelCaptainApplication,
  cancelCaptainApplication, lockApprovedCaptain, withApprovedCaptain, withPreStartEvent };
