// HomeScreen.test.jsx (or .tsx)
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("lucide-react", () => ({
  Play: () => <svg data-testid="play-icon" />,
}));

vi.mock("../ui/button", () => ({
  // Mock the Button component
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

// Mock WebSocket and window.location
const mockWebSocket = vi.fn().mockImplementation((url) => {
  return {
    url,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  };
});
vi.stubGlobal("WebSocket", mockWebSocket);

// Mock window.location
const mockWindowLocation = {
  protocol: "http:",
  host: "localhost",
};
vi.stubGlobal("window", {
  location: mockWindowLocation,
});

// Import the component to test
import HomeScreen from "../HomeScreen";

describe("HomeScreen", () => {
  // Test 1: Initial rendering
  it("renders without crashing and shows Apollo 11 title", () => {
    render(<HomeScreen onSceneSelect={vi.fn()} />);
    expect(screen.getByText("APOLLO 11")).toBeInTheDocument();
    expect(screen.getByText("One Small Step")).toBeInTheDocument();
  });

  // Test 2: "Begin Experience" button visibility and initial disabled state
  it('does not show "Begin Experience" button initially, but it appears disabled after selecting an option', () => {
    render(<HomeScreen onSceneSelect={vi.fn()} />);

    // the shouldn't be in the document at first
    const beginButtonInitial = screen.queryByText("Begin Experience");
    expect(beginButtonInitial).not.toBeInTheDocument();

    // Find and click the 'Launch Sequence' option button
    const launchButton = screen.getByText("Launch Sequence").closest("button");
    fireEvent.click(launchButton);

    // The "Begin Experience" button should now be in the document
    const beginButtonAfterSelect = screen.getByText("Begin Experience");
    expect(beginButtonAfterSelect).toBeInTheDocument();

    // It should be disabled because agcConnected starts as false
    expect(beginButtonAfterSelect).toBeDisabled();
  });
});
