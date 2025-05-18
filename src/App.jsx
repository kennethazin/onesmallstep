import React, { useState, lazy, Suspense, useEffect } from "react";
import HomeScreen from "./components/HomeScreen";
import Earth from "./components/EarthScene";
import LoadingScreen from "./components/LoadingScreen";
import AgcConnectionIndicator from "./components/AgcConnectionIndicator";
const MoonScene = lazy(() => import("./components/MoonScene"));

function App() {
  window.CESIUM_BASE_URL = "/cesium/"; //TODO find out why Cesium documentation has this?
  const [currentScene, setCurrentScene] = useState("home");
  const [isLoading, setIsLoading] = useState(false);
  const [nextScene, setNextScene] = useState(null);
  const [agcConnected, setAgcConnected] = useState(false);

  const handleEarthSceneEnd = () => {
    console.log("Earth scene finished, returning to home screen");
    setIsLoading(true);
    setNextScene("home");
  };

  // Handle scene selection from home screen
  const handleSceneSelect = (scene) => {
    console.log(`Selected scene: ${scene}`);
    setIsLoading(true);
    setNextScene(scene);
  };

  // Effect to transition from loading to the actual scene
  useEffect(() => {
    if (isLoading && nextScene) {
      const timer = setTimeout(() => {
        setCurrentScene(nextScene);
        setIsLoading(false);
        setNextScene(null);
      }, 5000); // Reduced timeout

      return () => clearTimeout(timer);
    }
  }, [isLoading, nextScene]);

  // webocket connection effect to monitor AGC status
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connection established");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle specific AGC status messages
        if (data.type === "agc-status") {
          setAgcConnected(data.connected);
          console.log(
            "AGC connection status:",
            data.connected ? "connected" : "disconnected"
          );
        }
        // Continue handling other message types if needed
        else if (data.type === "agc-output") {
          // Process AGC output data if needed
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
      setAgcConnected(false);
    };

    socket.onerror = () => {
      console.error("WebSocket error");
      setAgcConnected(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <>
      <AgcConnectionIndicator
        connected={agcConnected}
        data-testid="agc-indicator"
      />
      <div data-testid="home-screen">
        {currentScene === "home" && !isLoading && (
          <HomeScreen
            onSceneSelect={handleSceneSelect}
            data-testid="home-screen"
          />
        )}

        {isLoading && (
          <LoadingScreen
            message={
              nextScene === "earth"
                ? "Preparing Earth launch sequence..."
                : "Initiating lunar landing module..."
            }
            data-testid="loading-screen"
          />
        )}

        {currentScene === "earth" && !isLoading && (
          <Suspense
            fallback={
              <LoadingScreen message="Preparing Earth launch sequence..." />
            }
          >
            <Earth
              onEarthSceneEnd={handleEarthSceneEnd}
              data-testid="earth-scene"
            />
          </Suspense>
        )}

        {currentScene === "moon" && !isLoading && (
          <Suspense
            fallback={
              <LoadingScreen message="Initiating lunar landing module..." />
            }
          >
            <MoonScene />
          </Suspense>
        )}
      </div>
    </>
  );
}

export default App;
