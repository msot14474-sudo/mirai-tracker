import http from 'k6/http';
import { check } from 'k6';
import { scenario } from 'k6/execution';

const target = (__ENV.MIRAI_LOAD_URL || 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const asOf = __ENV.MIRAI_LOAD_AS_OF || '2026-10-08';
const sessionIds = (__ENV.MIRAI_LOAD_SESSION_IDS || 'session-20')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const cookie = __ENV.MIRAI_LOAD_COOKIE || '';

function perVuScenario(exec, vus, startTime, tags) {
  return {
    executor: 'per-vu-iterations',
    exec,
    vus,
    iterations: 3,
    maxDuration: '30s',
    startTime,
    tags,
  };
}

export const options = {
  scenarios: {
    dashboard_50: perVuScenario('dashboard', 50, '0s', {
      path: 'dashboard',
      level: '50',
    }),
    logging_50: perVuScenario('logging', 50, '35s', {
      path: 'logging',
      level: '50',
    }),
    dashboard_100: perVuScenario('dashboard', 100, '70s', {
      path: 'dashboard',
      level: '100',
    }),
    logging_100: perVuScenario('logging', 100, '105s', {
      path: 'logging',
      level: '100',
    }),
    dashboard_200: perVuScenario('dashboard', 200, '140s', {
      path: 'dashboard',
      level: '200',
    }),
    logging_200: perVuScenario('logging', 200, '175s', {
      path: 'logging',
      level: '200',
    }),
  },
  thresholds: {
    'http_req_duration{path:dashboard}': ['p(95)<2000'],
    'http_req_duration{path:logging}': ['p(95)<1000'],
    http_req_failed: ['rate<=0.01'],
  },
};

const params = {
  headers: cookie ? { Cookie: cookie } : {},
  timeout: '10s',
};

export function dashboard() {
  const response = http.get(
    `${target}/progress/dashboard?asOf=${encodeURIComponent(asOf)}`,
    {
      ...params,
      tags: { path: 'dashboard', level: scenario.name.split('_')[1] },
    },
  );
  check(response, {
    'dashboard returned 2xx': (value) =>
      value.status >= 200 && value.status < 300,
  });
}

export function logging() {
  const sessionId = sessionIds[(__VU - 1) % sessionIds.length];
  const response = http.post(
    `${target}/session-logs/sessions/${encodeURIComponent(sessionId)}/logs`,
    JSON.stringify({
      status: 'COMPLETED',
      overallCompletionPercentage: 100,
      coveredSummary: 'M16 end-of-day load test',
      leftOverSummary: null,
      carryForwardTopicId: null,
      classworkStatus: 'NOT_ASSIGNED',
      homeworkStatus: 'NOT_ASSIGNED',
      notes: 'Automated performance evidence; no topic progress changed.',
      mergedIntoSessionId: null,
      cancellationReason: null,
      clientElapsedSeconds: 1,
      topicUpdates: [],
    }),
    {
      ...params,
      headers: { ...params.headers, 'Content-Type': 'application/json' },
      tags: { path: 'logging', level: scenario.name.split('_')[1] },
    },
  );
  check(response, {
    'session log returned 2xx': (value) =>
      value.status >= 200 && value.status < 300,
  });
}
