import React from "react";
import { render, screen } from "@testing-library/react";
import App from "../App";
import { describe, it, expect, vi } from "vitest";

vi.useFakeTimers();

describe("App Component", () => {
  it("renders HomeScreen on initial load", () => {
    render(<App />);
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
  });
});
