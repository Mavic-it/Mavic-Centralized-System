// Local browser check. All payment responses are intercepted fixtures; no live booking is created.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve("tmp/manual-payment-ui");
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
  let submitted = 0;
  let status = "NOT_SUBMITTED";
  let lastPayload;
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
  const account = {
    id: "11111111-1111-4111-8111-111111111111",
    branchId: "test",
    paymentMethod: "BANK_TRANSFER",
    bankName: "Test Bank",
    accountName: "Test Company",
    accountNumber: "0000000000",
    qrCodeData: null,
    instructions: "UI test fixture only",
    isDefault: true,
    isActive: true,
  };
  const data = () => ({
    reference: "RSV-UI-TEST",
    customerName: "Test Customer",
    branchName: "Test Branch",
    spaceName: "Meeting Room",
    startAt: "2026-11-12T01:00:00.000Z",
    endAt: "2026-11-12T02:00:00.000Z",
    amount: 1000,
    paidAmount: 0,
    requiredAmount: 1000,
    paymentStatus: status,
    reservationStatus: "PENDING",
    holdUntil: "2026-11-12T00:30:00.000Z",
    paymentDeadline: "2026-11-11T00:30:00.000Z",
    expired: false,
    required: true,
    maxProofBytes: 5242880,
    accounts: [
      account,
      {
        ...account,
        id: "22222222-2222-4222-8222-222222222222",
        paymentMethod: "GCASH",
        bankName: null,
        accountNumber: "09171234567",
        isDefault: false,
      },
    ],
    submissions:
      status === "NOT_SUBMITTED"
        ? []
        : [
            {
              id: "proof-test",
              paymentMethod: "GCASH",
              transactionReference: "UI-TEST-123",
              submittedAmount: 1000,
              status,
              rejectionReason:
                status === "REJECTED"
                  ? "Unreadable proof. Please resubmit."
                  : null,
              verifiedAmount: null,
              submittedAt: "2026-11-10T00:00:00.000Z",
              verifiedAt: null,
            },
          ],
  });
  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const pending = calls.get(m.id);
      calls.delete(m.id);
      if (m.error) pending?.reject(new Error(m.error.message));
      else pending?.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      console.log("Browser exception:", m.params.exceptionDetails.text);
    if (m.method === "Fetch.requestPaused") {
      const { requestId, request } = m.params;
      let result = data();
      if (request.method === "POST") {
        submitted++;
        lastPayload = JSON.parse(request.postData);
        status = "AWAITING_VERIFICATION";
        result = { id: "proof-test", status };
      }
      void send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(result)).toString("base64"),
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
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__initialPaymentHash=location.hash;",
  });
  await send("Runtime.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/public/booking/reservations/*" }],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", {
    url: `${process.env.BOOKING_UI_URL ?? "http://127.0.0.1:3015"}/payment#reference=RSV-UI-TEST&token=${"a".repeat(64)}`,
  });
  await waitFor("document.body.innerText.includes('Test Company')");
  assert.equal(await evaluate("location.hash"), "");
  assert.equal(
    await evaluate("document.body.innerText.includes('₱1,000.00')"),
    true,
  );
  await evaluate(
    "(()=>{const select=document.querySelector('select');select.value='22222222-2222-4222-8222-222222222222';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await waitFor("document.body.innerText.includes('09171234567')");
  await send("DOM.enable");
  let tree = await send("DOM.getDocument", { depth: -1 });
  let file = await send("DOM.querySelector", {
    nodeId: tree.root.nodeId,
    selector: "input[name=proof]",
  });
  await writeFile(resolve(root, "unsupported.txt"), "unsupported");
  await send("DOM.setFileInputFiles", {
    nodeId: file.nodeId,
    files: [resolve(root, "unsupported.txt")],
  });
  await waitFor("document.body.innerText.includes('Choose a supported file')");
  await writeFile(
    resolve(root, "proof.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNa8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await send("DOM.setFileInputFiles", {
    nodeId: file.nodeId,
    files: [resolve(root, "proof.png")],
  });
  await waitFor(
    "!!document.querySelector('img[alt=\"Selected payment proof preview\"]')",
  );
  await evaluate(
    "(()=>{document.querySelector('input[name=reference]').value='UI-TEST-123';document.querySelector('input[name=date]').value='2026-11-09T12:00';document.querySelector('.payment-proof-form').requestSubmit();})()",
  );
  await waitFor(
    "document.body.innerText.includes('Payment Submitted — Awaiting Verification')",
  );
  assert.equal(submitted, 1);
  assert.equal(
    lastPayload.paymentAccountId,
    "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(lastPayload.amount, 1000);
  assert.ok(lastPayload.proofBase64);
  status = "REJECTED";
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Refresh status')).click()",
  );
  await waitFor(
    "document.body.innerText.includes('Unreadable proof')&&!!document.querySelector('input[name=proof]')",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["mobile", 390, 844],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
      true,
      `${name} has horizontal overflow`,
    );
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      resolve(root, `${name}.png`),
      Buffer.from(shot.data, "base64"),
    );
  }
  console.log(
    "Payment browser checks passed: ownership fragment removal, backend amount, account switching, upload validation/preview, proof submission, awaiting status, rejection/resubmission, desktop and mobile overflow.",
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
