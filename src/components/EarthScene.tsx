import { useEffect, useRef, useState } from "react"; // Add useState
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import fireImage from "../assets/fire.png";
import { Howl, Howler } from "howler";
import MissionChecklist from "./MissionChecklist";

interface EarthProps {
  onEarthSceneEnd: () => void;
}

// Define the launch checklist items
const launchChecklist = [
  {
    id: "launch1",
    text: "Load Saturn V flight program in AGC",
    checked: false,
    required: true,
  },
  {
    id: "launch8",
    text: "Verify launch window",
    checked: false,
    required: true,
  },
];

// Define mission constants outside the component
const MISSION_START_TIME = new Date(Date.UTC(1969, 6, 16, 13, 27, 45)); // Historical mission start time
const LAUNCH_TIME = new Date(Date.UTC(1969, 6, 16, 13, 32, 0)); // Actual launch time (T-0)

const Earth: React.FC<EarthProps> = ({ onEarthSceneEnd }) => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const onTickListenerRemoverRef = useRef<
    Cesium.Event.RemoveCallback | undefined
  >(undefined);
  const sceneSwitchTriggeredRef = useRef(false);

  const agcOutputReceivedRef = useRef(false);
  const websocketRef = useRef<WebSocket | null>(null);
  const liftoffTriggeredRef = useRef(false);

  // Store AGC connection states in refs to prevent re-renders
  const agcConnectedRef = useRef(false);
  const agcProgramTypeRef = useRef<string | null>(null);

  // Add states for UI display only, not for controlling Cesium initialisation
  const [showChecklist, setShowChecklist] = useState(true);
  const [agcConnected, setAgcConnected] = useState(false);
  const [agcProgramType, setAgcProgramType] = useState<string | null>(null);

  // Add states for the mission timer - initialised based on constants
  const [currentUtcTime, setCurrentUtcTime] =
    useState<Date>(MISSION_START_TIME);
  // tMinusTime will represent seconds relative to LAUNCH_TIME (positive before, negative after)
  const [tMinusTime, setTMinusTime] = useState<number>(
    Math.floor((LAUNCH_TIME.getTime() - MISSION_START_TIME.getTime()) / 1000)
  );

  const audioRefs = useRef<{
    stageAudios: Record<
      string,
      Array<{
        howl: Howl;
        startTime?: Cesium.JulianDate;
        played?: boolean;
        src?: string; // Keep track of src for stopping specific files
      }>
    >;
    radioAudios?: Record<string, Howl[]>;
    thrusterLoop?: Howl;
    ambientAudios?: Record<string, Howl>;
    currentStage?: string;
  }>({
    stageAudios: {},
    radioAudios: {},
    ambientAudios: {},
  });

  // Format T-minus/T-plus time as MM:SS with proper sign
  const formatTMinusTime = (seconds: number): string => {
    const isNegativeOrZero = seconds <= 0; // Treat 0 as T+0
    const absoluteSeconds = Math.abs(seconds);
    const minutes = Math.floor(absoluteSeconds / 60);
    const remainingSeconds = absoluteSeconds % 60;

    // Display T+ for 0 or negative seconds, T- for positive seconds
    return `${isNegativeOrZero ? "T+" : "T-"}${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Format UTC time
  const formatUtcTime = (date: Date): string => {
    // Check if date is valid before formatting
    if (!date || isNaN(date.getTime())) {
      return "Loading UTC..."; // Or some placeholder
    }
    return date.toISOString().substr(11, 8) + " UTC";
  };

  // Handle checklist completion
  const handleChecklistComplete = () => {
    setShowChecklist(false);
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    const stopStageAudio = (stageName: string, specificSrc?: string) => {
      if (audioRefs.current.stageAudios[stageName]) {
        audioRefs.current.stageAudios[stageName].forEach((audio) => {
          // If specificSrc is provided, only stop that audio file
          if (specificSrc && audio.src !== specificSrc) {
            return;
          }
          if (audio.howl.playing()) {
            console.log(
              `Stopping audio ${specificSrc ? `(${specificSrc}) ` : ""}for ${stageName}`
            );
            audio.howl.stop();
          }
        });
      }
    };

    ws.onopen = () => {
      console.log("WebSocket connection established");
      websocketRef.current = ws;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "agc-status") {
          console.log("AGC status update in EarthScene:", message);

          // Update refs to avoid re-renders
          agcConnectedRef.current = message.connected;
          agcProgramTypeRef.current = message.programType;

          // Update state for UI purposes only
          setAgcConnected(message.connected);
          setAgcProgramType(message.programType);
        }

        if (message.type === "agc-output") {
          console.log("Received AGC output:", message.payload);
          // Mark that we've received AGC output
          agcOutputReceivedRef.current = true;

          // Trigger liftoff if we're in prelaunch stage and haven't triggered liftoff yet
          if (
            !liftoffTriggeredRef.current &&
            viewerRef.current &&
            viewerRef.current.clock
          ) {
            const currentTime = viewerRef.current.clock.currentTime;
            // Use the LAUNCH_TIME constant directly
            const launchJulianTime = Cesium.JulianDate.fromDate(LAUNCH_TIME);

            // If we're still before the scheduled launch time, jump to it
            if (Cesium.JulianDate.compare(currentTime, launchJulianTime) < 0) {
              console.log(
                "AGC output received before scheduled time, triggering Saturn V liftoff NOW"
              );

              // Stop specific prelaunch audio immediately
              stopStageAudio("prelaunch", "/audio/a11_t-0000415.mp3");
              stopStageAudio("prelaunch", "/audio/a11_t-0000135.mp3");

              // Set Cesium clock to the exact launch time
              viewerRef.current.clock.currentTime = launchJulianTime;

              // Manually update the React state timers to reflect the jump to T=0
              const launchDate = Cesium.JulianDate.toDate(launchJulianTime);
              setCurrentUtcTime(launchDate);
              setTMinusTime(0); // Set relative time to T=0

              liftoffTriggeredRef.current = true;
            }
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      websocketRef.current = null;
    };

    // Define stage time intervals with support for multiple audio sources
    const stageIntervals = {
      prelaunch: {
        start: Cesium.JulianDate.fromIso8601("1969-07-16T13:27:38Z"),
        stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:32:00Z"),
        audioSources: [
          {
            src: "/audio/a11_t-0000415.mp3",
            volume: 0.5,
            loop: false,
            startTime: Cesium.JulianDate.fromIso8601("1969-07-16T13:27:38Z"), // T-4min 15sec
          },
          {
            src: "/audio/a11_t-0000135.mp3",
            volume: 0.5,
            loop: false,
            startTime: Cesium.JulianDate.fromIso8601("1969-07-16T13:30:21Z"), // T-1min 35sec
          },
        ],
      },
      stage1: {
        start: Cesium.JulianDate.fromIso8601("1969-07-16T13:32:01Z"),
        stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:32:50Z"),
        audioSources: [
          { src: "/audio/rocket-blastoff.mp3", volume: 0.3, loop: false },
        ],
        radioSources: [
          { src: "/audio/a11_0000000.mp3", volume: 0.6, loop: false },
        ],
      },
      stage2: {
        start: Cesium.JulianDate.fromIso8601("1969-07-16T13:34:55Z"),
        stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:44:44Z"),
        audioSources: [
          { src: "/audio/a11_0000255.mp3", volume: 0.5, loop: false },
        ],
        radioSources: [],
      },
    };

    // Initialise thruster loop with spatial properties
    audioRefs.current.thrusterLoop = new Howl({
      src: "/audio/thruster-loop.mp3",
      loop: true,
      volume: 0.4,
      spatial: true, // Add this to enable spatial audio
      panningModel: "HRTF", // Optional: use HRTF for better 3D sound
      refDistance: 1, // Distance at which the volume is normal
      rolloffFactor: 1, // How quickly the sound drops off with distance
      distanceModel: "linear", // Linear, inverse or exponential
    });

    // Initialise audio sources for each stage
    Object.entries(stageIntervals).forEach(([stageName, stageData]) => {
      // Initialise main audio for stage
      audioRefs.current.stageAudios[stageName] = stageData.audioSources.map(
        (audio) => ({
          howl: new Howl({
            src: [audio.src],
            loop: audio.loop ?? true,
            volume: audio.volume ?? 0.5,
          }),
          startTime: audio.startTime,
          played: false,
          src: audio.src, // Store src for later identification
        })
      );

      // Initialise radio comms for stage if available
      if (stageData.radioSources) {
        audioRefs.current.radioAudios = audioRefs.current.radioAudios || {};
        audioRefs.current.radioAudios[stageName] = stageData.radioSources.map(
          (audio) =>
            new Howl({
              src: [audio.src],
              loop: audio.loop ?? false,
              volume: audio.volume ?? 0.3,
            })
        );
      }
    });

    // Don't auto-play prelaunch audios - we'll handle this with the time check
    audioRefs.current.currentStage = "prelaunch";

    // Check if the container ref is available before initialising
    if (cesiumContainerRef.current && !viewerRef.current) {
      (async () => {
        async function initialiseViewer() {
          const terrainProvider =
            await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
          // Use the ref directly
          const viewer = new Cesium.Viewer(cesiumContainerRef.current!, {
            terrainProvider,
            shouldAnimate: true,
            // Disable editor tools like terrain chooser
            sceneModePicker: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            navigationHelpButton: false,
            infoBox: true,
            timeline: false, // Disable the timeline
            animation: false, // Disable the timer clock
          });

          // Configure Earth's atmosphere
          viewer.scene.globe.showGroundAtmosphere = true; // Enable ground atmosphere
          viewer.scene.skyAtmosphere.hueShift = 0.0; // Default blue hue
          viewer.scene.skyAtmosphere.saturationShift = 0.1; // Slightly increase saturation
          viewer.scene.skyAtmosphere.brightnessShift = 0.1; // Make atmosphere slightly brighter

          // Make atmosphere more visible from space
          viewer.scene.skyAtmosphere.atmosphereRayleighCoefficient =
            new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
          viewer.scene.skyAtmosphere.atmosphereMieCoefficient =
            new Cesium.Cartesian3(21e-6, 21e-6, 21e-6);

          // Explicitly set the start time to match the mission timeline
          const startTime = Cesium.JulianDate.fromDate(MISSION_START_TIME);
          viewer.clock.currentTime = startTime;
          viewer.clock.startTime = startTime;
          viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;

          return viewer;
        }

        // Only initialise once, never recreate the viewer
        const viewer = await initialiseViewer();
        viewerRef.current = viewer; // Store viewer instance

        try {
          const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
          viewer.scene.primitives.add(tileset);
          await viewer.zoomTo(tileset);

          // Apply the default style if it exists
          const extras = tileset.asset.extras;
          if (
            Cesium.defined(extras) &&
            Cesium.defined(extras.ion) &&
            Cesium.defined(extras.ion.defaultStyle)
          ) {
            tileset.style = new Cesium.Cesium3DTileStyle(
              extras.ion.defaultStyle
            );
          }
        } catch (error) {
          console.log(error);
        }

        viewer.scene.globe.depthTestAgainstTerrain = true;

        async function initialise() {
          const czmlFilePath = "/saturn_v_trajectory_with_delay.czml"; // Correct path to match the actual file
          try {
            console.log("Loading CZML file from:", czmlFilePath);
            const czmlDataSource = new Cesium.CzmlDataSource();
            await czmlDataSource.load(czmlFilePath);
            viewer.dataSources.add(czmlDataSource);

            // Debug all entities in the CZML
            console.log(
              "CZML loaded. Total entities:",
              czmlDataSource.entities.values.length
            );
            czmlDataSource.entities.values.forEach((entity) => {
              console.log(
                `Entity ID: ${entity.id}, Name: ${entity.name}, Has model: ${Boolean(entity.model)}`
              );
              if (entity.model && entity.model.uri) {
                console.log(
                  `Model URI for ${entity.id}:`,
                  entity.model.uri.getValue()
                );
              }
            });

            const satellite = czmlDataSource.entities.getById("SaturnV");
            const postTLI = czmlDataSource.entities.getById("Post-TLI");

            if (satellite && postTLI) {
              console.log("Found both Saturn V and Post-TLI entities");

              // Explicitly set Saturn V to be visible and ensure it has correct properties
              satellite.show = new Cesium.ConstantProperty(true);

              // Configure Saturn V model if needed
              if (satellite.model) {
                satellite.model.minimumPixelSize = new Cesium.ConstantProperty(
                  128
                );
                satellite.model.maximumScale = new Cesium.ConstantProperty(
                  20000
                );
                console.log("Saturn V model configured");
              } else {
                console.error("Saturn V entity doesn't have a model property!");
              }

              // Preload the LM model but keep it hidden initially
              postTLI.show = new Cesium.ConstantProperty(false);

              // Ensure the model path is correctly configured
              if (postTLI.model) {
                // Optional: Adjust model scale or appearance if needed
                postTLI.model.maximumScale = new Cesium.ConstantProperty(20000);
                postTLI.model.minimumPixelSize = new Cesium.ConstantProperty(
                  64
                );

                // Debug the model URI to ensure it's correctly set
                console.log(
                  "Post-TLI model URI:",
                  postTLI.model.uri?.getValue()
                );
              }

              // Ensure the Saturn V path remains visible after transition
              if (satellite.path) {
                satellite.path.show = new Cesium.ConstantProperty(true);
              }

              // Use VelocityOrientationProperty for automatic orientation
              const velocityOrientation =
                new Cesium.VelocityOrientationProperty(satellite.position);

              // Apply a fixed rotation to align the rocket model correctly
              const rotationMatrix = Cesium.Matrix3.fromRotationY(
                Cesium.Math.toRadians(90.0)
              );
              const rotationQuaternion =
                Cesium.Quaternion.fromRotationMatrix(rotationMatrix);

              // Define the actual liftoff time for comparison
              const liftoffTime = Cesium.JulianDate.fromDate(LAUNCH_TIME);

              satellite.orientation = new Cesium.CallbackProperty(
                (time, result) => {
                  // Check if we're in pre-launch phase
                  if (
                    time &&
                    Cesium.JulianDate.compare(time, liftoffTime) < 0
                  ) {
                    // Get the position at the current time
                    const position = satellite.position.getValue(
                      time,
                      new Cesium.Cartesian3()
                    );

                    if (position) {
                      // Calculate the transform at this position to get proper "up" direction
                      const transform =
                        Cesium.Transforms.eastNorthUpToFixedFrame(position);

                      // Extract just the rotation component to get a "pointing up" orientation
                      const rotation = Cesium.Matrix4.getMatrix3(
                        transform,
                        new Cesium.Matrix3()
                      );

                      // Add a fixed rotation if needed to align the model correctly
                      const fixedRotation = Cesium.Matrix3.fromRotationY(
                        Cesium.Math.toRadians(0.0)
                      );
                      Cesium.Matrix3.multiply(
                        rotation,
                        fixedRotation,
                        rotation
                      );

                      return Cesium.Quaternion.fromRotationMatrix(
                        rotation,
                        result || new Cesium.Quaternion()
                      );
                    }

                    // Fallback if position is undefined
                    return Cesium.Quaternion.IDENTITY.clone(result);
                  }

                  // After launch: use velocity-based orientation
                  // Get base orientation
                  const baseOrientation = velocityOrientation.getValue(
                    time,
                    result || new Cesium.Quaternion()
                  );

                  // Check if baseOrientation is defined before attempting to multiply
                  if (Cesium.defined(baseOrientation)) {
                    return Cesium.Quaternion.multiply(
                      baseOrientation,
                      rotationQuaternion,
                      result || new Cesium.Quaternion()
                    );
                  } else {
                    // Fallback orientation when velocity orientation is unavailable
                    return rotationQuaternion.clone(result);
                  }
                },
                false
              );

              // Create orientation for CSM-LM
              const postTLIVelocityOrientation =
                new Cesium.VelocityOrientationProperty(postTLI.position);

              // Apply appropriate rotation for CSM-LM model
              postTLI.orientation = new Cesium.CallbackProperty(
                (time, result) => {
                  const baseOrientation = postTLIVelocityOrientation.getValue(
                    time,
                    result || new Cesium.Quaternion()
                  );
                  // Add defensive check for baseOrientation
                  if (Cesium.defined(baseOrientation)) {
                    // Adjust rotation if needed for CSM-LM model orientation
                    return baseOrientation;
                  } else {
                    // Return identity quaternion as fallback
                    return Cesium.Quaternion.IDENTITY.clone(result);
                  }
                },
                false
              );

              satellite.viewFrom = new Cesium.ConstantProperty(
                new Cesium.Cartesian3(300, 20, 100)
              );

              // Set a similar viewFrom for Post-TLI
              postTLI.viewFrom = new Cesium.ConstantProperty(
                new Cesium.Cartesian3(-300, 20, 100)
              );

              // Set the camera to follow the satellite by default
              viewer.trackedEntity = satellite;

              // Set up a clock event listener
              const onTickListener = () => {
                if (!viewerRef.current || sceneSwitchTriggeredRef.current)
                  return;

                const clock = viewerRef.current.clock;
                const currentTime = clock.currentTime;
                const launchJulianTime =
                  Cesium.JulianDate.fromDate(LAUNCH_TIME);

                // Update React state timers based on Cesium clock
                const currentJsDate = Cesium.JulianDate.toDate(currentTime);
                setCurrentUtcTime(currentJsDate);
                const timeRelativeToLaunch = Math.floor(
                  (LAUNCH_TIME.getTime() - currentJsDate.getTime()) / 1000
                );
                setTMinusTime(timeRelativeToLaunch);

                // Check if we should prevent advancement past prelaunch
                if (
                  !agcOutputReceivedRef.current &&
                  !liftoffTriggeredRef.current
                ) {
                  // If the clock is about to advance past launch time, keep it just before
                  if (
                    Cesium.JulianDate.compare(currentTime, launchJulianTime) >=
                    0
                  ) {
                    // Keep time slightly before T=0 until AGC triggers launch
                    const oneSecondBefore = Cesium.JulianDate.addSeconds(
                      launchJulianTime,
                      +0.1, // Keep it very close to T=0
                      new Cesium.JulianDate()
                    );
                    // Only set if the current time isn't already exactly oneSecondBefore
                    if (
                      !Cesium.JulianDate.equals(currentTime, oneSecondBefore)
                    ) {
                      clock.currentTime = oneSecondBefore;
                      // Update React state again to reflect the clamped time
                      const clampedJsDate =
                        Cesium.JulianDate.toDate(oneSecondBefore);
                      setCurrentUtcTime(clampedJsDate);
                      setTMinusTime(
                        Math.floor(
                          (LAUNCH_TIME.getTime() - clampedJsDate.getTime()) /
                            1000
                        )
                      );
                    }
                    return; // Skip the rest of the tick processing
                  }
                }

                // Ensure the TLI end time is correctly formatted
                const correctedTliEndTime = Cesium.JulianDate.fromIso8601(
                  "1969-07-16T15:22:13Z"
                );

                // Debug current time and comparison
                if (
                  Cesium.JulianDate.compare(currentTime, correctedTliEndTime) >=
                  0
                ) {
                  // console.log("Current time has reached or passed TLI end time"); // Reduce console noise
                }

                // Logic for switching tracked entity (SaturnV -> Post-TLI)
                if (
                  viewerRef.current.trackedEntity === satellite &&
                  Cesium.JulianDate.compare(currentTime, correctedTliEndTime) >=
                    0
                ) {
                  console.log(
                    "Switching tracked entity to Post-TLI at",
                    Cesium.JulianDate.toIso8601(currentTime)
                  );

                  // Hide SaturnV entity
                  satellite.show = false;
                  if (satellite.path) {
                    satellite.path.show = new Cesium.ConstantProperty(false);
                  }

                  // Show Post-TLI entity
                  postTLI.show = true;
                  if (postTLI.path) {
                    postTLI.path.show = new Cesium.ConstantProperty(true);
                  }

                  // Switch tracked entity
                  viewerRef.current.trackedEntity = postTLI;

                  // Zoom to the Post-TLI entity for better visibility
                  viewerRef.current
                    .zoomTo(postTLI)
                    .then(() => {
                      console.log("Camera zoomed to Post-TLI entity");
                    })
                    .catch((error) => {
                      console.error(
                        "Failed to zoom to Post-TLI entity:",
                        error
                      );
                    });
                }

                // Define the time to trigger the scene switch
                const earthSceneEndTime = Cesium.JulianDate.fromIso8601(
                  "1969-07-16T16:50:00Z" // Time when Earth scene should end
                );

                // Check if the current time has reached the end time and trigger the scene switch callback
                if (
                  !sceneSwitchTriggeredRef.current && // Only trigger once
                  Cesium.JulianDate.compare(currentTime, earthSceneEndTime) >= 0
                ) {
                  console.log(
                    "Earth scene end time reached at",
                    Cesium.JulianDate.toIso8601(currentTime)
                  );
                  sceneSwitchTriggeredRef.current = true; // Mark as triggered
                  onEarthSceneEnd(); // Call the callback passed from App.jsx
                  // Stop the clock or remove the listener if desired after switching
                  // viewerRef.current.clock.shouldAnimate = false;
                  if (onTickListenerRemoverRef.current) {
                    onTickListenerRemoverRef.current();
                    onTickListenerRemoverRef.current = undefined;
                  }
                }
              };
              // Add the listener and store the remover function
              onTickListenerRemoverRef.current =
                viewer.clock.onTick.addEventListener(onTickListener);

              // Add a clock event listener to check for audio playback based on time
              viewer.clock.onTick.addEventListener(() => {
                if (!viewerRef.current) return;
                const currentJulianTime = viewer.clock.currentTime;

                // Find current stage
                let currentStage = null;
                for (const [stageName, interval] of Object.entries(
                  stageIntervals
                )) {
                  if (
                    Cesium.JulianDate.compare(
                      currentJulianTime,
                      interval.start
                    ) >= 0 &&
                    Cesium.JulianDate.compare(
                      currentJulianTime,
                      interval.stop
                    ) <= 0
                  ) {
                    currentStage = stageName;
                    break;
                  }
                }

                // Check all stage audio for time-based playback, regardless of current stage
                Object.entries(audioRefs.current.stageAudios).forEach(
                  ([stageName, audioItems]) => {
                    audioItems.forEach((audioItem) => {
                      if (audioItem.played) return; // Skip if already played

                      const shouldPlay = audioItem.startTime
                        ? Cesium.JulianDate.compare(
                            currentJulianTime,
                            audioItem.startTime
                          ) >= 0
                        : stageName === currentStage; // Play if no startTime but we're in this stage

                      if (shouldPlay) {
                        // Don't play prelaunch audio if liftoff was triggered early
                        if (
                          stageName === "prelaunch" &&
                          liftoffTriggeredRef.current
                        ) {
                          console.log(
                            `Skipping prelaunch audio ${audioItem.src} due to early liftoff.`
                          );
                          audioItem.played = true; // Mark as played to prevent future attempts
                          return;
                        }
                        console.log(`Playing audio: ${audioItem.src}`);
                        audioItem.howl.play();
                        audioItem.played = true;
                      }
                    });
                  }
                );

                if (
                  currentStage &&
                  currentStage !== audioRefs.current.currentStage
                ) {
                  console.log(`Transitioning to ${currentStage} stage`);

                  // Play any radio communications for this stage
                  playRandomRadioForStage(currentStage);

                  audioRefs.current.currentStage = currentStage;
                }
              });
            } else {
              console.error(
                "Entity loading failed. SaturnV found:",
                Boolean(satellite),
                "Post-TLI found:",
                Boolean(postTLI)
              );
            }

            // Optimised particle system for thrusters
            const thrusterParticles = new Cesium.ParticleSystem({
              image: fireImage, // Path to particle image
              startColor: Cesium.Color.RED.withAlpha(0.7), // Reduce opacity for better blending
              endColor: Cesium.Color.ORANGE.withAlpha(0.5), // Reduce opacity for better blending
              startScale: 50.0, // Adjust scale for performance
              endScale: 1.0, // Gradually
              minimumParticleLife: 0.5, // Increase minimum particle life
              maximumParticleLife: 1.0, // Increase maximum particle life
              minimumSpeed: 5.0, // Increase minimum speed
              maximumSpeed: 10.0, // Increase maximum speed
              emissionRate: 50, // Increase emission rate for more particles
              emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(45)), // Widen the emission cone
              modelMatrix: Cesium.Matrix4.IDENTITY,
              lifetime: 160.0, // Increase lifetime for longer visibility
            });

            viewer.scene.primitives.add(thrusterParticles);

            function updateThrusterParticles() {
              if (!viewerRef.current) return;
              const currentJulianTime = viewer.clock.currentTime;

              // Define burn times using JulianDate for accurate comparison
              // We'll reuse these for particle effects
              const burnIntervals = [
                new Cesium.TimeInterval({
                  start: Cesium.JulianDate.fromIso8601("1969-07-16T13:32:00Z"), // Launch
                  stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:34:44Z"), // tburn1 = 164s
                }), // Stage 1
                new Cesium.TimeInterval({
                  start: Cesium.JulianDate.fromIso8601("1969-07-16T13:34:45Z"), // After Stage 1
                  stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:41:15Z"), // tburn1 + tburn2 = 164s + 391s = 555s
                }), // Stage 2
                new Cesium.TimeInterval({
                  start: Cesium.JulianDate.fromIso8601("1969-07-16T13:41:16Z"), // After Stage 2
                  stop: Cesium.JulianDate.fromIso8601("1969-07-16T13:43:45Z"), // tburn1 + tburn2 + tburn3_1 = 164s + 391s + 150s = 705s
                }), // Stage 3 Burn 1
                new Cesium.TimeInterval({
                  start: Cesium.JulianDate.fromIso8601("1969-07-16T16:16:16Z"), // After Coast, TLI start
                  stop: Cesium.JulianDate.fromIso8601("1969-07-16T16:22:13Z"), // TLI end
                }), // Stage 3 Burn 2 (TLI)
              ];

              // Check if current time is within any burn interval (for particle effects)
              const isBurning = burnIntervals.some((interval) =>
                Cesium.TimeInterval.contains(interval, currentJulianTime)
              );

              // Determine which entity is currently active
              const activeEntity =
                viewer.trackedEntity === postTLI ? postTLI : satellite;

              thrusterParticles.show = isBurning && activeEntity === satellite; // Only show for SaturnV burns

              // Manage thruster audio independently
              if (isBurning && activeEntity === satellite) {
                // Thruster is active, play thruster sound if not already playing
                if (!audioRefs.current.thrusterLoop?.playing()) {
                  audioRefs.current.thrusterLoop?.play();
                }

                // Calculate distance from camera to rocket for spatial audio
                if (audioRefs.current.thrusterLoop) {
                  const cameraPosition = viewer.camera.positionWC; // Use world coordinates
                  const rocketPosition = activeEntity?.position?.getValue(
                    currentJulianTime,
                    new Cesium.Cartesian3()
                  );

                  if (rocketPosition) {
                    // Set Howler's listener position to the camera's world position
                    Howler.pos(
                      cameraPosition.x,
                      cameraPosition.y,
                      cameraPosition.z
                    );

                    // Set the thruster sound's position to the rocket's world position
                    audioRefs.current.thrusterLoop.pos(
                      rocketPosition.x,
                      rocketPosition.y,
                      rocketPosition.z
                    );
                  }
                }
              } else {
                // No thrusters, stop thruster sound
                audioRefs.current.thrusterLoop?.stop();
              }

              // Determine current stage based on time
              let currentStage = null;
              for (const [stageName, interval] of Object.entries(
                stageIntervals
              )) {
                if (
                  Cesium.JulianDate.compare(
                    currentJulianTime,
                    interval.start
                  ) >= 0 &&
                  Cesium.JulianDate.compare(currentJulianTime, interval.stop) <=
                    0
                ) {
                  currentStage = stageName;
                  break;
                }
              }

              // Handle stage audio transitions and manage multiple audio sources
              if (
                currentStage &&
                currentStage !== audioRefs.current.currentStage
              ) {
                console.log(`Transitioning to ${currentStage} audio`);

                // Only set the current stage - we'll handle audio playback in the tick listener
                audioRefs.current.currentStage = currentStage;
              }

              // Rest of thruster particle positioning logic
              if (activeEntity && isBurning && activeEntity === satellite) {
                // Ensure position and orientation exist before accessing them
                const position = activeEntity.position?.getValue(
                  currentJulianTime,
                  new Cesium.Cartesian3()
                );
                const orientation = activeEntity.orientation?.getValue(
                  currentJulianTime,
                  new Cesium.Quaternion()
                );

                if (position && orientation) {
                  const thrusterOffset = new Cesium.Cartesian3(0, 0, 0); // Example offset (adjust Z value)

                  // Get the model matrix (position and orientation)
                  const modelMatrix =
                    Cesium.Transforms.headingPitchRollToFixedFrame(
                      position,
                      Cesium.HeadingPitchRoll.fromQuaternion(orientation)
                    );

                  // Transform the offset from the model's local frame to world coordinates
                  const thrusterPosition = Cesium.Matrix4.multiplyByPoint(
                    modelMatrix,
                    thrusterOffset,
                    new Cesium.Cartesian3()
                  );

                  // Create a translation matrix for the thruster position
                  const translationMatrix = Cesium.Matrix4.fromTranslation(
                    thrusterPosition,
                    new Cesium.Matrix4()
                  );

                  // Get the rotation matrix from the orientation quaternion
                  const rotationMatrix = Cesium.Matrix3.fromQuaternion(
                    orientation,
                    new Cesium.Matrix3()
                  );

                  // Combine translation and rotation for the particle emitter's model matrix
                  // We want the particles to emit *from* the thruster position, oriented with the rocket.
                  const emitterModelMatrix = Cesium.Matrix4.multiply(
                    translationMatrix,
                    Cesium.Matrix4.fromRotationTranslation(
                      rotationMatrix,
                      Cesium.Cartesian3.ZERO
                    ), // Use only rotation part
                    new Cesium.Matrix4()
                  );

                  thrusterParticles.modelMatrix = emitterModelMatrix;
                }
              }
            }

            // Helper function to play random radio communication for current stage
            function playRandomRadioForStage(stage: string) {
              const radioAudios = audioRefs.current.radioAudios?.[stage];
              if (radioAudios && radioAudios.length > 0) {
                // Randomly select a radio clip to play
                const randomIndex = Math.floor(
                  Math.random() * radioAudios.length
                );
                radioAudios[randomIndex]?.play();
              }
            }

            viewer.clock.onTick.addEventListener(updateThrusterParticles);

            const viewModel = {
              show: true,
              intensity: 2.0,
              distortion: 10.0,
              dispersion: 0.4,
              haloWidth: 0.4,
              dirtAmount: 0.4,
            };

            const lensFlare = viewer.scene.postProcessStages.add(
              Cesium.PostProcessStageLibrary.createLensFlareStage()
            );

            function updatePostProcess() {
              lensFlare.enabled = Boolean(viewModel.show);
              lensFlare.uniforms.intensity = Number(viewModel.intensity);
              lensFlare.uniforms.distortion = Number(viewModel.distortion);
              lensFlare.uniforms.ghostDispersal = Number(viewModel.dispersion);
              lensFlare.uniforms.haloWidth = Number(viewModel.haloWidth);
              lensFlare.uniforms.dirtAmount = Number(viewModel.dirtAmount);
              lensFlare.uniforms.earthRadius =
                Cesium.Ellipsoid.WGS84.maximumRadius;

              // Increase the resolution of the lens flare reflection
              lensFlare.uniforms.resolution = 1024; // Set a higher resolution value
            }
            updatePostProcess();
          } catch (error) {
            if (error instanceof SyntaxError) {
              console.error(
                `Failed to parse the CZML file at '${czmlFilePath}'. Ensure the file contains valid CZML data.`,
                error
              );
            } else {
              console.error(
                `Failed to load the CZML file from '${czmlFilePath}'. Please check the file path and ensure the file is accessible.`,
                error
              );
            }
          }
        }
        await initialise();
      })();
    } // End of check for cesiumContainerRef.current

    // Cleanup function
    return () => {
      console.log("Cleaning up EarthScene");

      // Close WebSocket connection
      if (
        websocketRef.current &&
        websocketRef.current.readyState === WebSocket.OPEN
      ) {
        websocketRef.current.close();
      }

      // Stop all audio
      if (audioRefs.current) {
        // Stop all stage audio
        Object.values(audioRefs.current.stageAudios).forEach((audios) => {
          audios.forEach((audio) => audio.howl.stop());
        });

        // Stop all radio audio
        Object.values(audioRefs.current.radioAudios || {}).forEach((audios) => {
          audios.forEach((audio) => audio.stop());
        });

        // Stop thruster audio
        audioRefs.current.thrusterLoop?.stop();
      }

      if (onTickListenerRemoverRef.current) {
        console.log("Removing onTick listener");
        onTickListenerRemoverRef.current();
        onTickListenerRemoverRef.current = undefined;
      }

      // Destroy the viewer instance
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        console.log("Destroying Cesium viewer");
        viewerRef.current.destroy();
      }
      viewerRef.current = null;

      // Reset the trigger flag (optional, depends on component lifecycle)
      sceneSwitchTriggeredRef.current = false;
    };
  }, [onEarthSceneEnd]); // Keep dependency array

  // Determine if we have the correct AGC program for the launch
  // Added fallback for connected state without program type
  const canProceedWithLaunch =
    agcConnected &&
    (agcProgramType === "saturn_v" || (!agcProgramType && agcConnected));

  // Return the container div with the checklist overlay
  return (
    <div className="w-screen h-screen relative">
      <div
        ref={cesiumContainerRef}
        className="w-full h-full absolute top-0 left-0"
      />

      <div className="absolute top-4 right-4 z-10">
        <div className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-zinc-300 font-mono text-xs">
          <div className="mb-1 text-zinc-500">
            {formatUtcTime(currentUtcTime)}
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full mr-2 bg-zinc-500 animate-pulse"></div>
            {formatTMinusTime(tMinusTime)}
          </div>
          <div className="mt-1 text-zinc-400 text-[10px]">
            {tMinusTime > 0
              ? "PRE-LAUNCH"
              : tMinusTime >= -164
                ? "STAGE I"
                : tMinusTime >= -555
                  ? "STAGE II"
                  : tMinusTime >= -705
                    ? "STAGE III"
                    : tMinusTime >= -10000
                      ? "EARTH ORBIT"
                      : "TRANS-LUNAR INJECTION"}
          </div>
        </div>
      </div>

      <div className="absolute top-4 left-4 z-10">
        <div className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-zinc-300 font-mono text-xs">
          <div className="mb-1 text-zinc-500">SATURN V LAUNCH</div>
          <div className="flex items-center">
            <div
              className={`w-2 h-2 rounded-full mr-2 ${agcConnected ? "bg-zinc-500 animate-pulse" : "bg-zinc-700"}`}
            ></div>
            {agcConnected
              ? agcProgramType === "saturn_v"
                ? "PROGRAM LOADED"
                : "WAITING FOR PROGRAM"
              : "WAITING FOR AGC CONNECTION"}
          </div>
        </div>
      </div>

      {showChecklist && (
        <>
          <MissionChecklist
            title="SATURN V LAUNCH CHECKLIST"
            items={launchChecklist}
            onComplete={handleChecklistComplete}
            canProceed={canProceedWithLaunch}
            missionType="launch"
            waitingForAGC={true}
          />
        </>
      )}
    </div>
  );
};

export default Earth;
