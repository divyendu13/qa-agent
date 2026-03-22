import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get('https://demo.playwright.dev/todomvc');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time ok': (r) => r.timings.duration < 2000,
    'has content': (r) => r.body && r.body.length > 0,
  });

  sleep(1);
}
