const assert = require('assert');
const http = require('http');
const path = require('path');

const contentSecurity = require('../utils/contentSecurity');

async function testAssertSafeTextsPassesTrimmedContent() {
  assert.strictEqual(
    typeof contentSecurity.assertSafeTexts,
    'function',
    'contentSecurity should export assertSafeTexts for text moderation coverage'
  );

  const payloads = [];
  await contentSecurity.assertSafeTexts(
    [
      { label: '帖子内容', value: '  合规内容  ' },
      { label: '空字段', value: '   ' },
      { label: '空值', value: null }
    ],
    {
      openid: 'openid-user-1',
      scene: 3,
      textChecker: async (payload) => {
        payloads.push(payload);
        return { errcode: 0, result: { suggest: 'pass' } };
      }
    }
  );

  assert.deepStrictEqual(
    payloads,
    [
      {
        content: '合规内容',
        openid: 'openid-user-1',
        scene: 3,
        version: 2
      }
    ],
    'Only non-empty trimmed texts should be submitted to the WeChat text security API'
  );
}

async function testAssertSafeTextsRejectsRiskyContent() {
  await assert.rejects(
    () => contentSecurity.assertSafeTexts(
      [{ label: '帖子内容', value: '违规内容' }],
      {
        openid: 'openid-user-2',
        scene: 3,
        textChecker: async () => ({ errcode: 87014, errmsg: 'risky content' })
      }
    ),
    (error) => {
      assert.strictEqual(error && error.code, 'CONTENT_SECURITY_REJECTED');
      return true;
    },
    'Risky text should be rejected with a content-security error'
  );
}

async function testAssertSafeTextsFallsBackWithoutOpenId() {
  const payloads = [];

  await contentSecurity.assertSafeTexts(
    [{ label: '赛事标题', value: '测试赛事' }],
    {
      userId: null,
      scene: 3,
      textChecker: async (payload) => {
        payloads.push(payload);
        return { errcode: 0, result: { suggest: 'pass' } };
      }
    }
  );

  assert.deepStrictEqual(
    payloads,
    [
      {
        content: '测试赛事',
        scene: 3,
        version: 1
      }
    ],
    'When no openid is available, text moderation should fall back to version 1 instead of failing closed'
  );
}

function testResolveImageSourceSupportsCloudAndUploads() {
  assert.strictEqual(
    typeof contentSecurity.resolveImageSource,
    'function',
    'contentSecurity should export resolveImageSource for image source coverage'
  );

  const cloudSource = contentSecurity.resolveImageSource(
    'cloud://prod.1234567890-abc/path/avatar.png',
    {
      baseUrl: 'https://example.com',
      cloudIdToHttpUrl: (fileId) => `https://mocked.example/${encodeURIComponent(fileId)}`
    }
  );
  assert.strictEqual(
    cloudSource.url,
    'https://mocked.example/cloud%3A%2F%2Fprod.1234567890-abc%2Fpath%2Favatar.png',
    'cloud:// image sources should be converted into fetchable HTTP URLs'
  );

  const uploadSource = contentSecurity.resolveImageSource('/uploads/avatar.png', {
    baseUrl: 'https://example.com'
  });
  assert.strictEqual(
    uploadSource.filePath,
    path.join(path.resolve(__dirname, '..'), 'public', 'uploads', 'avatar.png'),
    'Relative /uploads paths should resolve to the backend public uploads directory'
  );
  assert.strictEqual(
    uploadSource.url,
    'https://example.com/uploads/avatar.png',
    'Relative /uploads paths should also keep a public URL for diagnostics'
  );
}

function testInterpretCheckResultDistinguishesRejectAndServiceErrors() {
  assert.strictEqual(
    typeof contentSecurity.interpretCheckResult,
    'function',
    'contentSecurity should export interpretCheckResult for result-branch coverage'
  );

  assert.deepStrictEqual(
    contentSecurity.interpretCheckResult({ errcode: 0, result: { suggest: 'pass' } }),
    { action: 'pass' },
    'Pass responses should stay green'
  );

  assert.deepStrictEqual(
    contentSecurity.interpretCheckResult({ errcode: 87014, errmsg: 'risky content' }),
    { action: 'reject', reason: 'risky content' },
    'WeChat risky-content responses should be classified as publish rejections'
  );

  assert.deepStrictEqual(
    contentSecurity.interpretCheckResult({ errcode: 40001, errmsg: 'invalid credential' }),
    { action: 'error', reason: 'invalid credential' },
    'Transport or credential failures should be treated as moderation-service errors'
  );
}

async function testRequestWechatApiPostsJsonPayload() {
  assert.strictEqual(
    typeof contentSecurity.requestWechatApi,
    'function',
    'contentSecurity should export requestWechatApi for transport coverage'
  );

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        method: req.method,
        path: req.url,
        body: JSON.parse(body || '{}')
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await contentSecurity.requestWechatApi({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port,
      path: '/wxa/msg_sec_check?access_token=test-token',
      method: 'POST',
      json: { content: 'safe text', version: 2 }
    });

    assert.deepStrictEqual(
      response,
      {
        ok: true,
        method: 'POST',
        path: '/wxa/msg_sec_check?access_token=test-token',
        body: { content: 'safe text', version: 2 }
      },
      'requestWechatApi should send JSON payloads and parse JSON responses'
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function main() {
  await testAssertSafeTextsPassesTrimmedContent();
  await testAssertSafeTextsRejectsRiskyContent();
  await testAssertSafeTextsFallsBackWithoutOpenId();
  testResolveImageSourceSupportsCloudAndUploads();
  testInterpretCheckResultDistinguishesRejectAndServiceErrors();
  await testRequestWechatApiPostsJsonPayload();
  console.log('All assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
