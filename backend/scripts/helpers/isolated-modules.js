const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../..');

function loadIsolated(relativePath, dependencies = {}, globals = {}) {
  const filename = path.join(root, relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
      throw new Error(`Unstubbed dependency: ${name}`);
    },
    __dirname: path.dirname(filename), __filename: filename,
    console, Buffer, URL, process: { env: {} }, ...globals
  }, { filename });
  return module.exports;
}

function createRouterHarness() {
  const handlers = new Map();
  const router = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (url, ...callbacks) => handlers.set(`${method} ${url}`, callbacks.at(-1));
  }
  return { express: { Router: () => router }, handlers };
}

async function invoke(handler, request) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
    send(body) { this.body = body; return this; }
  };
  await handler(request, response);
  return response;
}

module.exports = { root, loadIsolated, createRouterHarness, invoke };
