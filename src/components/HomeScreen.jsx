"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play } from "lucide-react"; // Import Wifi icons
import { Button } from "./ui/button";
import { Howl } from "howler";

const HomeScreen = ({ onSceneSelect }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [agcConnected, setAgcConnected] = useState(false);
  const [agcProgramType, setAgcProgramType] = useState(null);
  const hoverSoundRef = useRef(null);
  const soundtrackRef = useRef(null);
  const wsRef = useRef(null); // Ref for WebSocket

  useEffect(() => {
    hoverSoundRef.current = new Howl({
      src: ["/audio/hover.mp3"],
      volume: 0.3,
      preload: true,
    });

    return () => {
      if (hoverSoundRef.current) {
        hoverSoundRef.current.unload();
      }
    };
  }, []);

  useEffect(() => {
    soundtrackRef.current = new Howl({
      src: ["/audio/onesmallstep_soundtrack.mp3"],
      autoplay: true,
      loop: true,
      volume: 0.5,
      onend: function () {
        console.log("Soundtrack finished!");
      },
    });

    return () => {
      if (soundtrackRef.current) {
        soundtrackRef.current.stop();
        soundtrackRef.current.unload();
      }
    };
  }, []);

  useEffect(() => {
    // Determine WebSocket protocol based on window location protocol
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "agc-status") {
          console.log(
            "Received AGC status:",
            message.connected,
            "Program:",
            message.programType
          );
          setAgcConnected(message.connected);
          setAgcProgramType(message.programType);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected");
      setAgcConnected(false);
      setAgcProgramType(null);
    };

    // Cleanup function
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    // waiting for the "Begin Experience" button
  };

  const handleBeginExperience = () => {
    const sceneMap = {
      launch: "earth",
      landing: "moon",
    };

    // only proceed if an option is selected and the AGC is connected
    if (selectedOption && sceneMap[selectedOption] && agcConnected) {
      onSceneSelect(sceneMap[selectedOption]);
    } else {
      console.log(
        "Cannot begin sim. Option selected:",
        selectedOption,
        "AGC connected:",
        agcConnected
      );
    }
  };

  const playHoverSound = () => {
    if (hoverSoundRef.current) {
      hoverSoundRef.current.play();
    }
  };

  const isButtonDisabled = !selectedOption || !agcConnected;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90 z-10"></div>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source
            src="https://9m9q3cs802.ufs.sh/f/tjjqrl6qwAEbYvt7acjWEyT7sfrH3UuMX5OjJBzq4m0eSNpd"
            type="video/mp4"
          />
          Video tag not supported by your browser.
        </video>
        <div className="noise-bg"></div>
      </div>

      <div className="relative z-20 flex flex-col items-center justify-center min-h-screen px-4 py-12 text-white">
        <div className="absolute top-8 right-8">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Apollo_11_insignia.png/1188px-Apollo_11_insignia.png"
            alt="Apollo 11 Logo"
            className="w-16 h-16 md:w-20 md:h-20"
          />
        </div>
        <div className="absolute top-8 left-8 text-xs tracking-tight opacity-70">
          With the Apollo Guidance Computer
        </div>

        <div className="mb-16 text-center">
          <h1 className="text-4xl md:text-7xl font-normal tracking-tighter mb-3">
            APOLLO 11
          </h1>
          <p className="text-sm md:text-base uppercase tracking-[0.20em] text-gray-400 font-normal">
            One Small Step
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-5xl">
          <div className="group" onMouseEnter={playHoverSound}>
            <button
              onClick={() => handleOptionSelect("launch")}
              className={`w-full aspect-[1.6/1] rounded-lg overflow-hidden relative transition-all duration-300 ${
                selectedOption === "launch"
                  ? "ring-1 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                  : "hover:ring-1 hover:ring-yellow-400/30"
              } ${
                agcProgramType === "saturn_v"
                  ? ""
                  : agcConnected && agcProgramType !== null
                    ? "opacity-50 cursor-not-allowed"
                    : "" // Dim if connected but wrong program
              }`}
              // Disable button if AGC is connected but not the right program
              disabled={
                agcConnected &&
                agcProgramType !== null &&
                agcProgramType !== "saturn_v"
              }
              title={
                agcConnected &&
                agcProgramType !== null &&
                agcProgramType !== "saturn_v"
                  ? "Incorrect AGC program loaded for Launch Sequence"
                  : ""
              }
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10">
                <div className="absolute inset-0 bg-black/50"></div>
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                >
                  <source
                    src="https://9m9q3cs802.ufs.sh/f/tjjqrl6qwAEb2hBZFilxBoT8hlv2KRkq7mAgnwPCiNG14cSX"
                    type="video/mp4"
                  />
                  Video tag not supported by your browser.
                </video>
              </div>
              <div className="absolute inset-0 bg-[url('/placeholder.png')] bg-cover bg-center"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-6">
                <div className="w-14 h-14 rounded-full bg-yellow-500/10 backdrop-blur-sm flex items-center justify-center mb-6 group-hover:bg-yellow-500/20 transition-all duration-300 border border-yellow-400/20">
                  <Play className="h-6 w-6 text-white ml-1" />
                </div>
                <h3 className="text-xl font-light uppercase tracking-wider mb-2">
                  Launch Sequence
                </h3>
                <p className="text-xs text-center text-gray-400 max-w-xs font-light tracking-wide">
                  Experience the historic liftoff of Apollo 11 from Kennedy
                  Space Center
                </p>
                {agcConnected &&
                  agcProgramType !== null &&
                  agcProgramType !== "saturn_v" && (
                    <p className="text-xs text-red-400 mt-2">
                      Incorrect AGC Program Loaded
                    </p>
                  )}
              </div>
            </button>
          </div>

          <div className="group" onMouseEnter={playHoverSound}>
            <button
              onClick={() => handleOptionSelect("landing")}
              className={`w-full aspect-[1.6/1] rounded-lg overflow-hidden relative transition-all duration-300 ${
                selectedOption === "landing"
                  ? "ring-1 ring-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.3)]"
                  : "hover:ring-1 hover:ring-blue-400/30 "
              } ${
                agcProgramType === "moon_landing"
                  ? ""
                  : agcConnected && agcProgramType !== null
                    ? "opacity-50 cursor-not-allowed"
                    : ""
              }`}
              disabled={
                agcConnected &&
                agcProgramType !== null &&
                agcProgramType !== "moon_landing"
              }
              title={
                agcConnected &&
                agcProgramType !== null &&
                agcProgramType !== "moon_landing"
                  ? "Incorrect AGC program loaded for Moon Landing"
                  : ""
              }
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10">
                <div className="absolute inset-0 bg-black/50"></div>
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                >
                  <source
                    src="https://9m9q3cs802.ufs.sh/f/tjjqrl6qwAEbtoz04A6qwAEbUi2tY6OMXFHyud1vS3Ze0fPo"
                    type="video/mp4"
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="absolute inset-0 bg-[url('/placeholder.svg?height=400&width=600')] bg-cover bg-center"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-6">
                <div className="w-14 h-14 rounded-full bg-blue-500/10 backdrop-blur-sm flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-all duration-300 border border-blue-400/20">
                  <Play className="h-6 w-6 text-white ml-1" />
                </div>
                <h3 className="text-xl font-light uppercase tracking-wider mb-2">
                  Moon Landing
                </h3>
                <p className="text-xs text-center text-gray-400 max-w-xs font-light tracking-wide">
                  Witness the Eagle lunar module touch down on the lunar surface
                </p>
                {agcConnected &&
                  agcProgramType !== null &&
                  agcProgramType !== "moon_landing" && (
                    <p className="text-xs text-red-400 mt-2">
                      Incorrect AGC Program Loaded
                    </p>
                  )}
              </div>
            </button>
          </div>
        </div>

        <div className="mt-4 h-16">
          {selectedOption && (
            <div className="animate-fade-in">
              <Button
                onClick={handleBeginExperience}
                onMouseEnter={playHoverSound}
                size="lg"
                disabled={isButtonDisabled}
                className={`bg-transparent hover:bg-white/5 text-white border border-white/20 rounded-full px-8 py-6 h-auto text-sm uppercase tracking-widest font-light transition-all duration-300 hover:border-white/40 ${
                  isButtonDisabled
                    ? "opacity-50 cursor-not-allowed hover:bg-transparent hover:border-white/20"
                    : ""
                }`}
                title={
                  !agcConnected
                    ? "Apollo Guidance Computer must be connected to begin."
                    : ""
                }
              >
                Begin Experience
              </Button>
            </div>
          )}
        </div>

        <div className="absolute bottom-6 left-0 right-0 text-center text-[10px] text-gray-500 tracking-wider uppercase font-light">
          © {new Date().getFullYear()} One Small Step | Made by Kenneth Ras and
          Om Dighe | NASA Archive Footage
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
