import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import MissionChecklist from "./MissionChecklist";
import { Howl } from "howler";

// Set the default ellipsoid to Moon
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON;

// Define Points of Interest and Camera Views outside the component
const pointsOfInterest = [
  { text: "Apollo 11", latitude: 0.67416, longitude: 23.47315 },
  { text: "Apollo 14", latitude: -3.64417, longitude: 342.52135 },
  { text: "Apollo 15", latitude: 26.13341, longitude: 3.6285 },
];

// Define lunar descent checklist items
const lunarDescentChecklist = [
  {
    id: "item9",
    text: "Verify AGC Lunar Descent program loaded",
    checked: false,
    required: true,
  },
];

// Initialise audio for lunar descent
const descentRadio = new Howl({
  src: ["/audio/a11_landing.mp3"],
  volume: 0.7,
  preload: true,
  html5: true,
  loop: false,
});

// Define the landing time
const landingTime = Cesium.JulianDate.fromIso8601("1969-07-20T20:17:00Z");
// Define mission constants
const MISSION_START_JULIAN = Cesium.JulianDate.fromIso8601(
  "1969-07-20T20:02:50Z"
); // Historical mission start time
const LAUNCH_JULIAN = Cesium.JulianDate.fromIso8601("1969-07-16T13:32:00Z"); // Actual launch time (T-0)
const MISSION_START_DATE = Cesium.JulianDate.toDate(MISSION_START_JULIAN);
const LAUNCH_DATE = Cesium.JulianDate.toDate(LAUNCH_JULIAN);

const MoonScene: React.FC = () => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioPlayingRef = useRef<boolean>(false);
  const descentInitiatedRef = useRef<boolean>(false);

  // State for checklist and simulation flow
  const [showChecklist, setShowChecklist] = useState(true);
  const [agcConnected, setAgcConnected] = useState(false);
  const [agcProgramType, setAgcProgramType] = useState<string | null>(null);
  const [simulationActive, setSimulationActive] = useState(false);
  const [checklistCompleted, setChecklistCompleted] = useState(false);
  const lastProgramTypeRef = useRef<string | null>(null);
  const [missionPhase, setMissionPhase] = useState<string>("PRE-DESCENT");
  // State for the dynamic status text
  const [statusText, setStatusText] = useState<string>(
    "WAITING FOR AGC PROGRAM"
  );

  // Add states for the mission timer, initialised from Cesium start time
  const [currentUtcTime, setCurrentUtcTime] =
    useState<Date>(MISSION_START_DATE);
  const [tMinusTime, setTMinusTime] = useState<number>(
    Math.floor((LAUNCH_DATE.getTime() - MISSION_START_DATE.getTime()) / 1000)
  );

  const formatTMinusTime = (seconds: number): string => {
    const isNegativeOrZero = seconds <= 0; // Treat 0 as T+0
    const absoluteSeconds = Math.abs(seconds);
    const hours = Math.floor(absoluteSeconds / 3600);
    const minutes = Math.floor((absoluteSeconds % 3600) / 60);
    const remainingSeconds = absoluteSeconds % 60;

    // Display T+ for 0 or negative seconds, T- for positive seconds
    return `${isNegativeOrZero ? "T+" : "T-"}${hours
      .toString()
      .padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Format UTC time
  const formatUtcTime = (date: Date): string => {
    // Ensure date is valid before formatting
    if (!date || isNaN(date.getTime())) {
      return "00:00:00 UTC"; // Or some placeholder
    }
    return date.toISOString().substr(11, 8) + " UTC";
  };

  // Connect WebSocket for AGC data
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connection established in MoonScene");
      websocketRef.current = ws;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "agc-status") {
          console.log("AGC status update in MoonScene:", message);
          setAgcConnected(message.connected);
          setAgcProgramType(message.programType);

          const isMoonLandingProgram = message.programType === "moon_landing";
          const canStartSimulation = message.connected && isMoonLandingProgram;

          // Auto-proceed when moon_landing program is first detected
          if (
            isMoonLandingProgram &&
            lastProgramTypeRef.current !== "moon_landing" &&
            !simulationActive &&
            showChecklist
          ) {
            console.log("Moon landing program detected - auto proceeding!");
            handleChecklistComplete(); // This will also start the clock animation
          }

          // Control clock animation based on AGC status *before* descent is initiated
          if (
            viewerRef.current &&
            !viewerRef.current.isDestroyed() &&
            !descentInitiatedRef.current
          ) {
            viewerRef.current.clock.shouldAnimate = canStartSimulation;
          }
          // If descent has been initiated, ensure animation continues regardless of AGC status
          else if (
            viewerRef.current &&
            !viewerRef.current.isDestroyed() &&
            descentInitiatedRef.current
          ) {
            viewerRef.current.clock.shouldAnimate = true;
          }

          lastProgramTypeRef.current = message.programType;
        }

        if (message.type === "agc-output") {
          console.log("Received AGC output in MoonScene:", message.payload);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error in MoonScene:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed in MoonScene");
      websocketRef.current = null;
    };

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [simulationActive, showChecklist]); // Add dependencies

  // Start the Cesium viewer when the component mounts
  useEffect(() => {
    let clockTickListener: Cesium.Event.RemoveCallback | undefined;
    if (cesiumContainerRef.current && !viewerRef.current) {
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        baseLayer: false, // No base imagery layer
        timeline: false,
        animation: false,
        shouldAnimate: true,
        baseLayerPicker: false,
        geocoder: false,
        shadows: true,
        homeButton: false,
        infoBox: true,
        sceneModePicker: false,
        navigationHelpButton: false,
      });
      viewerRef.current = viewer;
      const scene = viewer.scene;

      // Set initial clock state matching MISSION_START_JULIAN
      viewer.clock.currentTime = MISSION_START_JULIAN;
      viewer.clock.startTime = MISSION_START_JULIAN;
      viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
      viewer.clock.shouldAnimate = false; // Start paused

      scene.skyBox = Cesium.SkyBox.createEarthSkyBox();

      Cesium.Cesium3DTileset.fromIonAssetId(2684829, {
        enableCollision: true,
      })
        .then((tileset) => {
          scene.primitives.add(tileset);
        })
        .catch((error) => {
          console.log(`Error loading tileset: ${error}`);
        });

      pointsOfInterest.forEach((poi) => {
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(poi.longitude, poi.latitude),
          label: {
            text: poi.text,
            font: "14pt Verdana",
            outlineColor: Cesium.Color.DARKSLATEGREY,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -22),
            scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
            translucencyByDistance: new Cesium.NearFarScalar(
              2.5e7,
              1.0,
              4.0e7,
              0.0
            ),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromBytes(243, 242, 99),
            outlineColor: Cesium.Color.fromBytes(219, 218, 111),
            outlineWidth: 2,
            scaleByDistance: new Cesium.NearFarScalar(1.5e3, 1.0, 4.0e7, 0.1),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      });

      async function initialise() {
        const czmlFilePath = "/apollo11_mission_descent.czml";
        try {
          // Explicitly set the start time to match the mission timeline
          const startTime = MISSION_START_JULIAN;

          const stopTime = Cesium.JulianDate.fromIso8601(
            "1969-07-21T21:00:00Z"
          );

          const czmlDataSource = new Cesium.CzmlDataSource({
            clock: new Cesium.DataSourceClock({
              startTime: startTime,
              currentTime: startTime,
              stopTime: stopTime,
              clockRange: Cesium.ClockRange.LOOP_STOP,
              multiplier: 1,
            }),
          });

          await czmlDataSource.load(czmlFilePath);
          await viewer.dataSources.add(czmlDataSource);

          // Ensure viewer clock matches the data source clock settings
          viewer.clock.startTime = startTime;
          viewer.clock.currentTime = startTime;
          viewer.clock.stopTime = stopTime; // Set stop time as well
          viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
          viewer.clock.multiplier = 1;
          viewer.clock.shouldAnimate = false; // Keep paused initially

          const descentStage = czmlDataSource.entities.getById("LM_Descent");
          const ascentStage = czmlDataSource.entities.getById("LM_Ascent");

          if (descentStage && descentStage.position) {
            descentStage.orientation = new Cesium.VelocityOrientationProperty(
              descentStage.position
            );
            descentStage.viewFrom = new Cesium.ConstantProperty(
              new Cesium.Cartesian3(0, 50, 10)
            );
            viewer.trackedEntity = descentStage;
          }

          if (ascentStage && ascentStage.position) {
            ascentStage.orientation = new Cesium.VelocityOrientationProperty(
              ascentStage.position
            );
            ascentStage.viewFrom = new Cesium.ConstantProperty(
              new Cesium.Cartesian3(-100, 20, 50)
            );
          } else {
            console.error(
              "Descent stage position is undefined at the current time."
            );
          }
        } catch (error) {
          console.error(
            `Failed to load the CZML file from '${czmlFilePath}'.`,
            error
          );
        }
      }

      initialise();

      // Add clock tick listener to update status text AND React timers
      clockTickListener = viewer.clock.onTick.addEventListener((clock) => {
        // Update React state timers from Cesium clock
        const currentJulianDate = clock.currentTime;
        const currentJsDate = Cesium.JulianDate.toDate(currentJulianDate);
        setCurrentUtcTime(currentJsDate);

        const timeRelativeToLaunch = Math.floor(
          (LAUNCH_DATE.getTime() - currentJsDate.getTime()) / 1000
        );
        setTMinusTime(timeRelativeToLaunch);

        // Update status text based on simulation state and time
        if (simulationActive) {
          if (
            Cesium.JulianDate.greaterThanOrEquals(
              currentJulianDate,
              landingTime
            )
          ) {
            setStatusText("EAGLE HAS LANDED");
            setMissionPhase("LANDING COMPLETE"); // Optionally update mission phase too
          } else {
            setStatusText("DESCENT IN PROGRESS");
          }
        } else if (!showChecklist && checklistCompleted) {
          // This state might occur briefly if checklist completes but AGC isn't ready yet
          setStatusText("WAITING FOR AGC PROGRAM");
        } else if (showChecklist) {
          setStatusText("WAITING FOR AGC PROGRAM");
        }
      });

      // Cleanup function
      return () => {
        if (clockTickListener) {
          clockTickListener(); // Remove the listener
        }
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.destroy();
        }
        viewerRef.current = null;
      };
    }
  }, []); // Run only once on mount

  const handleChecklistComplete = () => {
    setChecklistCompleted(true);
    setShowChecklist(false);
    setSimulationActive(true);
    setMissionPhase("LUNAR DESCENT INITIATED");
    setStatusText("DESCENT IN PROGRESS"); // Set initial status after checklist

    descentInitiatedRef.current = true;

    if (!audioPlayingRef.current) {
      descentRadio.play();
      audioPlayingRef.current = true;
    }

    // Start Cesium clock animation ONLY if it's not already running
    if (
      viewerRef.current &&
      !viewerRef.current.isDestroyed() &&
      !viewerRef.current.clock.shouldAnimate
    ) {
      viewerRef.current.clock.shouldAnimate = true;
    }
  };

  // Clean up audio when component unmounts
  useEffect(() => {
    return () => {
      if (audioPlayingRef.current) {
        descentRadio.stop();
        audioPlayingRef.current = false;
      }
    };
  }, []);

  const canProceedWithMission =
    agcConnected && agcProgramType === "moon_landing";

  return (
    <div className="relative w-full h-screen">
      <div ref={cesiumContainerRef} className="w-full h-full" />

      {showChecklist && (
        <MissionChecklist
          title="LUNAR DESCENT CHECKLIST"
          items={lunarDescentChecklist}
          onComplete={handleChecklistComplete}
          canProceed={canProceedWithMission}
          missionType="landing"
          waitingForAGC={true}
        />
      )}

      <div className="absolute top-4 right-4 z-10">
        <div className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-zinc-300 font-mono text-xs">
          <div className="mb-1 text-zinc-500">
            {formatUtcTime(currentUtcTime)}
          </div>
          <div className="flex items-center">
            {/* Conditionally render pulse based on Cesium clock animation state */}
            <div
              className={`w-2 h-2 rounded-full mr-2 ${viewerRef.current?.clock.shouldAnimate ? "bg-zinc-500 animate-pulse" : "bg-zinc-700"}`}
            ></div>
            {formatTMinusTime(tMinusTime)}
          </div>
        </div>
      </div>

      {!showChecklist && checklistCompleted && (
        <div className="absolute top-4 left-4 z-10">
          <button className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-zinc-300 font-mono text-xs hover:bg-zinc-900 transition-colors">
            <div className="mb-1 text-zinc-500">{missionPhase}</div>
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  simulationActive && statusText === "DESCENT IN PROGRESS"
                    ? "bg-zinc-500 animate-pulse" // Pulse only during active descent
                    : statusText === "EAGLE HAS LANDED"
                      ? "bg-green-500" // Solid green on landing
                      : "bg-zinc-700" // Default grey
                }`}
              ></div>
              {statusText}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default MoonScene;
