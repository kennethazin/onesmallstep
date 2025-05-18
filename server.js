import express from "express";
import process from "process";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: ".env.local" });
const PORT = process.env.PORT || 3001;

const app = express();

const distPath = path.join(__dirname, "dist");
const distExists = fs.existsSync(distPath);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Only serve static files if dist directory exists
if (distExists) {
  app.use(express.static(distPath));
} else {
  console.warn("Warning: 'dist' directory was not found.");
  console.warn("Built the application first.");
}

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(500).send("Server error");
});

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Create WebSocket server
const wss = new WebSocketServer({
  noServer: true,
});

// AGC connection status
let agcConnected = false;
// AGC program type
let agcProgramType = null;

// Function to check AGC connection status from output.txt
function checkAgcConnectionStatus() {
  try {
    if (fs.existsSync(outputFilePath)) {
      const content = fs.readFileSync(outputFilePath, "utf8");
      return content.includes("yaDSKY is connected.");
    }
  } catch (err) {
    console.error("Error reading AGC connection status:", err);
  }
  return false;
}

// detects which AGC program is loaded
function detectAgcProgram(content) {
  try {
    const lines = content.split("\n");

    // Look for register values after the connection line
    const connectedIndex = lines.findIndex((line) =>
      line.includes("yaDSKY is connected.")
    );
    if (connectedIndex === -1) return null; // Not connected yet

    // Get all register entries after connection
    const registerLines = lines
      .slice(connectedIndex + 1)
      .filter((line) => /R3D\d+:\s*\d+/.test(line));

    // If we don't have enough register entries, return null (program not loaded yet)
    if (registerLines.length < 7) return null;

    // Count R3D1:0 entries
    const r3d1Zeros = registerLines
      .filter((line) => line.trim().startsWith("R3D1:"))
      .filter((line) => line.includes("R3D1: 0")).length;

    // Check for R3D5:1 which is unique to Saturn V
    const hasSaturnR3D5 = registerLines.some((line) =>
      line.includes("R3D5: 1")
    );

    console.log(
      `Program detection: R3D1 zeros: ${r3d1Zeros}, Saturn R3D5 found: ${hasSaturnR3D5}`
    );

    // Determine program type based on patterns
    if (hasSaturnR3D5) {
      return "saturn_v";
    } else if (r3d1Zeros >= 5) {
      // if we have multiple consecutive R3D1:0 entries, its most likely moon landing program
      return "moon_landing";
    }

    // if registers exist but don't match known patterns, return "unknown"
    return registerLines.length > 0 ? "unknown" : null;
  } catch (err) {
    console.error("Error detecting AGC program type:", err);
    return null;
  }
}

// this broadcasts the AGC connection status to all clients
function broadcastAgcStatus(status, programType = null) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "agc-status",
          connected: status,
          programType: programType,
        })
      );
    }
  });
}

// Add a new function to check for specific Apollo 11 launch sequence
function detectApollo11LaunchSequence(content) {
  // The specific pattern we're looking for
  const pattern = [
    "yaDSKY is connected.",
    "R3D1: 0",
    "R3D2: 0",
    "R3D3: 0",
    "R3D4: 0",
    "R3D5: 0",
    "R3D4: 0",
    "R3D5: 1",
    "R3D1: 0",
    "R3D1: 0",
  ];

  // Convert content to lines and trim whitespace
  const lines = content.split("\n").map((line) => line.trim());

  // Check if all pattern lines exist in sequence
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern[0])) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) return false;

  // Check if subsequent lines match the pattern
  for (let i = 1; i < pattern.length; i++) {
    const lineIndex = startIndex + i;
    if (lineIndex >= lines.length || !lines[lineIndex].includes(pattern[i])) {
      return false;
    }
  }

  return true;
}

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Send initial AGC connection status and program type to new client
  const currentStatus = checkAgcConnectionStatus();
  ws.send(
    JSON.stringify({
      type: "agc-status",
      connected: currentStatus,
      programType: agcProgramType,
    })
  );

  // Update global status if different
  if (agcConnected !== currentStatus) {
    agcConnected = currentStatus;
    console.log(
      `AGC connection status: ${agcConnected ? "connected" : "disconnected"}`
    );
  }

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// Upgrade HTTP server to handle WebSocket protocol
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Set up file watching for the AGC output.txt file
const outputFilePath = path.join(__dirname, "./ragc/yaDSKY2/output.txt");
let isWatchingFile = false;

// Function to parse the output.txt content
function parseOutputContent(content) {
  // Split the content into lines
  const lines = content.split("\n");

  // Find the first line starting with "R3D" instead of skipping a fixed number
  let startIndex = lines.findIndex((line) => line.trim().startsWith("R3D"));
  if (startIndex === -1) startIndex = lines.length; // No data found

  // Process in groups of 5 lines starting from R3D1
  const results = [];
  for (let i = startIndex; i < lines.length; i += 5) {
    const group = lines.slice(i, i + 5);
    if (group.length === 0) continue;

    // Extract data from each line in the group
    const groupData = {};
    for (const line of group) {
      const match = line.match(/R3D(\d+):\s*(\d+)/);
      if (match) {
        const [, register, value] = match;
        groupData[`R3D${register}`] = parseInt(value, 10);
      }
    }

    // Only add non-empty groups
    if (Object.keys(groupData).length > 0) {
      results.push(groupData);
    }
  }

  return results;
}

// Start watching the output file if it exists
function setupFileWatcher() {
  if (isWatchingFile) return;

  try {
    if (fs.existsSync(outputFilePath)) {
      console.log(`Watching AGC output file: ${outputFilePath}`);

      // Set initial content and check connection status
      let previousContent = "";
      let apollo11LaunchSequenceDetected = false;

      try {
        previousContent = fs.readFileSync(outputFilePath, "utf8");
        // Check and broadcast initial connection status
        agcConnected = previousContent.includes("yaDSKY is connected.");

        // Detect initial program type
        agcProgramType = detectAgcProgram(previousContent);
        console.log(
          `Initial AGC connection status: ${agcConnected ? "connected" : "disconnected"}, Program Type: ${agcProgramType || "not loaded"}`
        );

        // Always broadcast initial status
        broadcastAgcStatus(agcConnected, agcProgramType);
      } catch (err) {
        console.error("Error reading initial output.txt content:", err);
      }

      // Set up the watcher
      const watcher = fs.watch(outputFilePath, (eventType) => {
        if (eventType === "change") {
          try {
            const currentContent = fs.readFileSync(outputFilePath, "utf8");
            if (currentContent !== previousContent) {
              // Check if AGC connection status changed
              const newConnectionStatus = currentContent.includes(
                "yaDSKY is connected."
              );

              // Detect AGC program type
              const newProgramType = detectAgcProgram(currentContent);

              const oldStatus = agcConnected;
              const oldProgramType = agcProgramType;

              // Always update global status
              agcConnected = newConnectionStatus;
              agcProgramType = newProgramType;

              // Log changes for debugging
              if (
                oldStatus !== agcConnected ||
                oldProgramType !== agcProgramType
              ) {
                console.log(
                  `AGC status updated: ${oldStatus ? "connected" : "disconnected"} -> ${agcConnected ? "connected" : "disconnected"}, ` +
                    `Program: ${oldProgramType || "not loaded"} -> ${agcProgramType || "not loaded"}`
                );
              }

              // Always broadcast current status on content change
              broadcastAgcStatus(agcConnected, agcProgramType);

              // Check for Apollo 11 launch sequence
              if (
                !apollo11LaunchSequenceDetected &&
                detectApollo11LaunchSequence(currentContent)
              ) {
                apollo11LaunchSequenceDetected = true;
                console.log("Apollo 11 launch sequence detected!");

                // Broadcast special message for Apollo 11 launch sequence
                wss.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(
                      JSON.stringify({
                        type: "apollo11-launch-sequence-detected",
                        verified: true,
                      })
                    );
                  }
                });
              }

              // Process AGC output data
              const parsedData = parseOutputContent(currentContent);
              if (parsedData.length > 0) {
                console.log(
                  "AGC output data updated:",
                  parsedData[parsedData.length - 1]
                );

                // Send to WebSocket clients
                wss.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(
                      JSON.stringify({
                        type: "agc-output",
                        payload: parsedData[parsedData.length - 1],
                      })
                    );
                  }
                });
              }

              previousContent = currentContent;
            }
          } catch (err) {
            console.error("Error reading output.txt:", err);
          }
        }
      });

      // Handle watcher errors
      watcher.on("error", (error) => {
        console.error("Error watching output.txt:", error);
        isWatchingFile = false;
      });

      isWatchingFile = true;
    } else {
      console.warn(`AGC output file not found: ${outputFilePath}`);
      // Try again in 5 seconds in case the file is created later
      setTimeout(setupFileWatcher, 5000);
    }
  } catch (err) {
    console.error("Error setting up file watcher:", err);
    isWatchingFile = false;
    // Try again in 5 seconds
    setTimeout(setupFileWatcher, 5000);
  }
}

setupFileWatcher();

function clearOutputFile() {
  try {
    if (fs.existsSync(outputFilePath)) {
      fs.writeFileSync(outputFilePath, "", "utf8");
      console.log("Output file cleared successfully on server shutdown");
    }
  } catch (err) {
    console.error("Error clearing output file:", err);
  }
}

// Handle graceful shutdown
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    // TODO: not sure why ts server is having issues here
    console.log(
      `\nReceived ${signal} signal, clearing output file and shutting down...`
    );
    clearOutputFile();

    // Close server connections
    server.close(() => {
      console.log("Server shut down gracefully");
      process.exit(0);
    });

    // Force exit if server doesn't close in 3 seconds
    setTimeout(() => {
      console.error("Forced server shutdown");
      process.exit(1);
    }, 3000);
  });
});

// Modify the SPA fallback routes to check if the dist directory exists
app.get("/", (req, res) => {
  if (distExists) {
    res.sendFile(path.join(distPath, "index.html"));
  } else {
    res
      .status(404)
      .send(
        "Frontend build files not found. Please build the frontend application."
      );
  }
});

// Then handle other routes as needed
app.get("/:path", (req, res) => {
  if (distExists) {
    res.sendFile(path.join(distPath, "index.html"));
  } else {
    res.status(404).send("Frontend build files not found");
  }
});

export {
  server,
  app,
  wss,
  checkAgcConnectionStatus,
  detectAgcProgram,
  detectApollo11LaunchSequence,
  parseOutputContent,
};
