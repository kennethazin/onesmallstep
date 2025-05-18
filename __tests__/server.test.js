import { spawn } from "child_process";
import { writeFileSync, existsSync, unlinkSync } from "fs";
import process from "process";
import { expect, describe, beforeAll, it, beforeEach, afterAll } from "vitest";
import { join, resolve } from "path";
import WebSocket from "ws"; // Use the 'ws' library client
import { fileURLToPath } from "url";
import { dirname } from "path";

let __dirname = dirname(fileURLToPath(import.meta.url));
const serverScriptPath = resolve(__dirname, "../server.js");

const outputFilePath = join(__dirname, "../ragc/yaDSKY2/output.txt"); // Adjust path
const serverPort = 3002; // Use a different port than your dev server
const wsUrl = `ws://localhost:${serverPort}`;

let serverProcess;
let receivedMessages = []; // To store messages received by the WS client
// Helper to wait for the server to be ready
function waitForServerReady(process) {
  return new Promise((resolve, reject) => {
    process.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[SERVER] ${output}`); // Optional: log server output during test
      if (output.includes(`Server running at http://localhost:${serverPort}`)) {
        resolve();
      }
    });
    process.stderr.on("data", (data) => {
      console.error(`[SERVER ERROR] ${data.toString()}`);
      // Optionally reject if critical error is logged
    });
    process.on("error", (err) => reject(err));
    process.on("exit", (code) => {
      if (code !== 0 && !serverProcess.killed) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
}

// Helper to wait for a specific WebSocket message
function waitForWebSocketMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener("message", onMessage);
      reject(
        new Error(
          `Timed out waiting for message type: ${type}. Received types: ${receivedMessages.map((m) => m.type).join(", ")}`
        )
      );
    }, 5000); // Adjust timeout as needed

    const onMessage = (message) => {
      try {
        const data = JSON.parse(message.toString());
        receivedMessages.push(data);
        if (data.type === type) {
          clearTimeout(timeout);
          ws.removeListener("message", onMessage);
          resolve(data);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", message.toString(), err);
      }
    };
    ws.on("message", onMessage);
  });
}

describe("Backend Integration Test (Rust Output -> Node Server -> WebSocket)", () => {
  beforeAll(async () => {
    // Ensure output.txt exists and is empty
    if (existsSync(outputFilePath)) {
      unlinkSync(outputFilePath); // Start clean
    }
    writeFileSync(outputFilePath, "../", "utf8");

    // Start the Node.js server process
    // Pass the test port as an env variable so server can use it
    serverProcess = spawn("node", [serverScriptPath], {
      env: { ...process.env, PORT: serverPort },
      // Uncomment to see server output during test runs
      // stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for the server to indicate it's ready
    await waitForServerReady(serverProcess);

    console.log("Server is ready.");
  });

  beforeEach(() => {
    receivedMessages = []; // Clear messages before each test
    // Clear the output file at the start of each test
    writeFileSync(outputFilePath, "", "utf8");
  });

  afterAll(() => {
    // Kill the server process
    if (serverProcess && !serverProcess.killed) {
      console.log("Attempting to shut down server...");
      serverProcess.kill("SIGINT"); // Or 'SIGTERM'
      // Optional: wait for process to exit before finishing
      // return new Promise(resolve => serverProcess.on('exit', resolve));
    }
    // Ensure output file is clean after tests
    if (existsSync(outputFilePath)) {
      unlinkSync(outputFilePath);
    }
  });

  it("should broadcast initial status when a client connects", async () => {
    // Server is already running (beforeAll) and file is empty (beforeEach)
    const wsClient = new WebSocket(wsUrl);

    // Wait for the client to connect and receive the initial status message
    const statusMessage = await waitForWebSocketMessage(wsClient, "agc-status");

    expect(statusMessage).toHaveProperty("connected", false);
    expect(statusMessage).toHaveProperty("programType", null);

    wsClient.close(); // Clean up client
  });

  it("should broadcast agc-output when register data appears after connection", async () => {
    const wsClient = new WebSocket(wsUrl);
    await new Promise((resolve) => wsClient.on("open", resolve));

    // Simulate connection and some register data
    const content =
      `yaDSKY is connected.\n` +
      `R3D1: 123\n` +
      `R3D2: 456\n` +
      `R3D3: 789\n` +
      `R3D4: 000\n` +
      `R3D5: 111\n`;
    writeFileSync(outputFilePath, content, "utf8");

    // Wait for the server to send the status update first (might happen quickly)
    // await waitForWebSocketMessage(wsClient, 'agc-status'); // Optional, might already be sent

    // Wait for the agc-output message
    const outputMessage = await waitForWebSocketMessage(wsClient, "agc-output");

    expect(outputMessage).toHaveProperty("payload");
    expect(outputMessage.payload).toEqual({
      R3D1: 123,
      R3D2: 456,
      R3D3: 789,
      R3D4: 0, // Ensure leading zeros handled
      R3D5: 111,
    });

    wsClient.close();
  });

  it("should detect and broadcast apollo11-launch-sequence-detected", async () => {
    const wsClient = new WebSocket(wsUrl);
    await new Promise((resolve) => wsClient.on("open", resolve));

    // Simulate writing the specific pattern line by line or all at once
    // Writing line by line might be more realistic for fs.watch,
    // but writing all at once is simpler for a basic test.
    const sequenceContent =
      `yaDSKY is connected.\n` +
      `R3D1: 0\n` +
      `R3D2: 0\n` +
      `R3D3: 0\n` +
      `R3D4: 0\n` +
      `R3D5: 0\n` +
      `R3D4: 0\n` + // Note: this is in the pattern
      `R3D5: 1\n` + // Note: this is in the pattern
      `R3D1: 0\n` + // Note: this is in the pattern
      `R3D1: 0\n`; // Note: this is in the pattern

    writeFileSync(outputFilePath, sequenceContent, "utf8");

    // Wait for the special message
    const launchDetectedMessage = await waitForWebSocketMessage(
      wsClient,
      "apollo11-launch-sequence-detected"
    );

    expect(launchDetectedMessage).toHaveProperty("verified", true);

    wsClient.close();
  });

  // TODO: Add more tests for :
  // - it should broadcast agc-status connected: true when "yaDSKY is connected.
  // - Program type detection ('saturn_v', 'moon_landing')
});
