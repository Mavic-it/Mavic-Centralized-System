// Local browser check. All payment responses are intercepted fixtures; no live booking is created.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve("tmp/booking-draft-ui");
await mkdir(root, { recursive: true });
const browser = spawn(
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-features=RendererCodeIntegrity",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${resolve(root, "profile")}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
const endpoint = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Browser startup timed out")),
    30000,
  );
  browser.stderr.on("data", (chunk) => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  browser.on("error", reject);
});
let socket;
try {
  socket = new WebSocket(endpoint);
  await new Promise((r, j) => {
    socket.addEventListener("open", r, { once: true });
    socket.addEventListener("error", j, { once: true });
  });
  let sessionId;
  let nextId = 0;
  const calls = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        calls.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 45000);
      calls.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId &&
          !method.startsWith("Target.") &&
          !method.startsWith("Browser.")
            ? { sessionId }
            : {}),
        }),
      );
    });

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));
  const start = `${date}T09:00:00+08:00`,
    finish = `${date}T10:00:00+08:00`;
  const space = {
    id: "room-test",
    branchId: "branch-test",
    branchName: "Test Branch",
    name: "Test Meeting Room",
    type: "MEETING_ROOM",
    capacity: 10,
    description: "Test fixture",
    amenities: [],
    minMinutes: 30,
    maxMinutes: 480,
    bufferMinutes: 0,
  };
  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const pending = calls.get(m.id);
      calls.delete(m.id);
      if (m.error) pending?.reject(new Error(m.error.message));
      else pending?.resolve(m.result);
    }
    if (m.method === "Fetch.requestPaused") {
      const { requestId, request } = m.params;
      const path = new URL(request.url).pathname;
      let data;
      if (path.endsWith("/branches"))
        data = [{ id: "branch-test", name: "Test Branch" }];
      else if (path.endsWith("/spaces")) data = [space];
      else if (path.endsWith("/availability"))
        data = {
          timezone: "Asia/Manila",
          date,
          slots: [{ startAt: start, endTimes: [finish] }],
          policy: {
            openTime: "07:00",
            closeTime: "19:00",
            allowedDays: [1, 2, 3, 4, 5, 6, 7],
            minAdvanceMinutes: 0,
            maxAdvanceDays: 365,
            autoConfirm: false,
            slotMinutes: 30,
          },
        };
      else if (path.endsWith("/quote"))
        data = { amount: 1000, requiredAmount: 1000, currency: "PHP" };
      else throw new Error(`Unexpected booking request: ${path}`);
      void send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(data)).toString("base64"),
      });
    }
  });
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  const waitFor = async (expression) => {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(
      `Browser condition timed out: ${expression}; ${await evaluate("JSON.stringify({href:location.href,initialHash:window.__initialPaymentHash,body:document.body.innerText.slice(0,1200)})")}`,
    );
  };

  const target = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (
    await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    })
  ).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/public/booking/*" }],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", {
    url: process.env.BOOKING_UI_URL ?? "http://127.0.0.1:3015",
  });
  await waitFor("!!document.querySelector('.space-action')");
  await evaluate("document.querySelector('.space-action').click()");
  await waitFor(
    "location.pathname==='/book'&&!!document.querySelector('input[autocomplete=name]')",
  );
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  await fill("input[type=date]", date);
  await fill("input[autocomplete=name]", "Draft Test Customer");
  await fill("input[type=email]", "draft@example.invalid");
  await fill("input[type=tel]", "09171234567");
  await fill('input[placeholder^="e.g. Team planning"]', "Planning session");
  await waitFor("!!document.querySelector('.slots button')");
  await evaluate("document.querySelector('.slots button').click()");
  await evaluate(
    `(()=>{const e=document.querySelectorAll('form select')[1];e.value=${JSON.stringify(finish)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await waitFor(
    "JSON.parse(sessionStorage.getItem('mspaces.booking-draft.v1')||'{}').draft?.customerName==='Draft Test Customer'",
  );
  await send("Page.reload");
  await waitFor(
    "document.querySelector('input[autocomplete=name]')?.value==='Draft Test Customer'",
  );
  assert.equal(
    await evaluate("document.querySelector('input[type=email]').value"),
    "draft@example.invalid",
  );
  await waitFor("document.querySelectorAll('form select')[1]?.value!==''");
  await evaluate(
    "document.querySelector('header a[href=\"/cancel\"]').click()",
  );
  await waitFor("!!document.querySelector('.discard-draft-modal[open]')");
  assert.equal(await evaluate("location.pathname"), "/book");
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor("!document.querySelector('.discard-draft-modal')");
  assert.equal(
    await evaluate("document.querySelector('input[autocomplete=name]').value"),
    "Draft Test Customer",
  );
  await evaluate("document.querySelector('form').requestSubmit()");
  await waitFor(
    "location.pathname==='/review'&&document.body.innerText.includes('Draft Test Customer')",
  );
  await send("Page.reload");
  await waitFor(
    "location.pathname==='/review'&&document.body.innerText.includes('Draft Test Customer')",
  );
  await evaluate("document.querySelector('.policy-trigger').click()");
  await waitFor("!!document.querySelector('.policy-modal[open]')");
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor("!document.querySelector('.policy-modal')");
  await evaluate("history.back()");
  await waitFor(
    "location.pathname==='/book'&&!!document.querySelector('input[autocomplete=name]')",
  );
  assert.equal(
    await evaluate("!!document.querySelector('.discard-draft-modal')"),
    false,
  );
  await evaluate("history.back()");
  await waitFor("!!document.querySelector('.discard-draft-modal[open]')");
  await evaluate(
    "Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Keep booking').click()",
  );
  await waitFor("!document.querySelector('.discard-draft-modal')");
  assert.equal(await evaluate("location.pathname"), "/book");
  await evaluate("history.back()");
  await waitFor("!!document.querySelector('.discard-draft-modal[open]')");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
    true,
  );
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    resolve(root, "leave-modal-mobile.png"),
    Buffer.from(shot.data, "base64"),
  );
  await evaluate(
    "Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Discard draft and leave').click()",
  );
  await waitFor("location.pathname==='/'");
  assert.equal(
    await evaluate("sessionStorage.getItem('mspaces.booking-draft.v1')"),
    null,
  );
  await waitFor("!!document.querySelector('.space-action')");
  await evaluate("document.querySelector('.space-action').click()");
  await waitFor(
    "location.pathname==='/book'&&!!document.querySelector('input[autocomplete=name]')",
  );
  assert.equal(
    await evaluate("document.querySelector('input[autocomplete=name]').value"),
    "",
  );
  await evaluate(
    "document.querySelector('header a[href=\"/cancel\"]').click()",
  );
  await waitFor("!!document.querySelector('.discard-draft-modal[open]')");
  await evaluate(
    "Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Discard draft and leave').click()",
  );
  await waitFor("location.pathname==='/cancel'");
  assert.equal(
    await evaluate("sessionStorage.getItem('mspaces.booking-draft.v1')"),
    null,
  );
  console.log(
    "Draft browser checks passed: refresh and review restoration, policy modal, Escape/keep, internal Back, external Back confirmation, discard reset, navigation links, mobile layout and cleared inputs.",
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await new Promise((r) => setTimeout(r, 1000));
  }
  socket?.close();
  browser.kill();
  browser.stderr.destroy();
  browser.unref();
}
