const { check, sleep } = require('k6');
const { http } = require('k6');

export let options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        'http_req_duration': ['p(95)<2000'],
        'http_req_failed': ['rate<0.05'],
    },
};

export default function() {
    const res = http.get('https://demo.playwright.dev/todomvc');
    check(res, {
        'status is 200': (r) => r.status === 200,
        'body contains "TodoMVC"': (r) => r.body.includes('TodoMVC'),
    });
    sleep(1);
}