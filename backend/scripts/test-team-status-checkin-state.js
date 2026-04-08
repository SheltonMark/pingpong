const assert = require('assert');

const eventsRouter = require('../routes/events');
const { computeEventStatus } = eventsRouter;

global.getApp = () => ({
  globalData: {}
});

global.Page = (config) => {
  global.__checkInPageConfig = config;
};

const checkInModule = require('../../pages/check-in/check-in.js');
const checkinRouter = require('../routes/checkin');

function testTeamEventUsesTeamCountForCapacity() {
  const status = computeEventStatus({
    event_type: 'team',
    status: 'registration',
    registration_end: '2099-03-31 23:59:59',
    event_start: '2099-04-01 10:00:00',
    event_end: '2099-04-02 18:00:00',
    max_participants: 6,
    participant_count: 8,
    team_count: 2
  });

  assert.strictEqual(
    status,
    'registration',
    'Team events should stay in registration until team_count reaches max_participants'
  );
}

function testCheckedOutStateDisablesFurtherCheckIn() {
  assert.strictEqual(
    typeof checkInModule.deriveCheckInActionState,
    'function',
    'check-in page should export deriveCheckInActionState for regression coverage'
  );

  const state = checkInModule.deriveCheckInActionState({
    activeRecord: null,
    records: [
      {
        id: 101,
        check_in_time: '2099-03-31 08:00:00',
        check_out_time: '2099-03-31 09:00:00'
      }
    ],
    withinRange: true,
    timeStatus: 'ok',
    now: new Date('2099-03-31T12:00:00')
  });

  assert.deepStrictEqual(
    state,
    {
      actionMode: 'checked_out',
      canSubmit: false,
      actionButtonText: '已签退'
    },
    'Once today has been checked out, the page should stay in a completed state'
  );
}

function testFrontendUsesSafeLocalTimeWindowParsing() {
  assert.strictEqual(
    typeof checkInModule.getPointTimeStatus,
    'function',
    'check-in page should export getPointTimeStatus for time-window regression coverage'
  );

  const status = checkInModule.getPointTimeStatus(
    {
      start_time: '2099-03-29 00:30:00',
      end_time: '2099-03-29 23:59:59'
    },
    new Date('2099-03-29T00:31:00+08:00')
  );

  assert.strictEqual(
    status,
    'ok',
    'A point should become available immediately after its configured start_time'
  );
}

function testFrontendPrefersCurrentlyActivePoint() {
  assert.strictEqual(
    typeof checkInModule.selectDisplayPoint,
    'function',
    'check-in page should export selectDisplayPoint for multi-date selection coverage'
  );

  const point = checkInModule.selectDisplayPoint({
    points: [
      {
        id: 28,
        name: '3月28日签到',
        distance: 10,
        start_time: '2099-03-28 00:00:00',
        end_time: '2099-03-28 23:59:59'
      },
      {
        id: 29,
        name: '3月29日签到',
        distance: 15,
        start_time: '2099-03-29 00:00:00',
        end_time: '2099-03-29 23:59:59'
      }
    ],
    activeRecord: null,
    location: { lat: 30.0, lng: 120.0 },
    now: new Date('2099-03-29T12:00:00+08:00')
  });

  assert.strictEqual(
    point && point.id,
    29,
    'When multiple points are published, the page should prefer the currently active point over an ended one'
  );
}

function testBackendUsesSafeLocalTimeWindowParsing() {
  assert.strictEqual(
    typeof checkinRouter.getPointTimeStatus,
    'function',
    'checkin route should export getPointTimeStatus for backend time-window regression coverage'
  );

  const status = checkinRouter.getPointTimeStatus(
    {
      start_time: '2099-03-29 00:30:00',
      end_time: '2099-03-29 23:59:59'
    },
    new Date('2099-03-29T00:31:00+08:00')
  );

  assert.strictEqual(
    status,
    'ok',
    'Backend check-in validation should allow sign-in immediately after the configured start_time'
  );
}

function testCheckInTimeParsingIsTimezoneIndependent() {
  const RealDate = Date;

  class UTCDate extends RealDate {
    constructor(...args) {
      if (args.length >= 2) {
        return new RealDate(RealDate.UTC(...args));
      }
      return new RealDate(...args);
    }

    static now() {
      return RealDate.now();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }

    static [Symbol.hasInstance](instance) {
      return instance instanceof RealDate;
    }
  }

  global.Date = UTCDate;

  try {
    const point = {
      start_time: '2026-04-08 09:30:00',
      end_time: '2026-04-08 10:30:00'
    };
    const now = new Date('2026-04-08T09:31:00+08:00');

    assert.strictEqual(
      checkinRouter.getPointTimeStatus(point, now),
      'ok',
      'Backend should treat MySQL datetime strings as China Standard Time even when the runtime timezone is UTC'
    );

    assert.strictEqual(
      checkInModule.getPointTimeStatus(point, now),
      'ok',
      'Frontend should treat MySQL datetime strings as China Standard Time even when the runtime timezone is UTC'
    );
  } finally {
    global.Date = RealDate;
  }
}

function main() {
  testTeamEventUsesTeamCountForCapacity();
  testCheckedOutStateDisablesFurtherCheckIn();
  testFrontendUsesSafeLocalTimeWindowParsing();
  testFrontendPrefersCurrentlyActivePoint();
  testBackendUsesSafeLocalTimeWindowParsing();
  testCheckInTimeParsingIsTimezoneIndependent();
  console.log('All assertions passed');
}

main();
