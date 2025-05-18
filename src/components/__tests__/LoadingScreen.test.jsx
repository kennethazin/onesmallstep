import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, beforeEach, describe, test, expect, afterEach } from "vitest"; // Import vi from vitest
import SpaceLoadingScreen from "../LoadingScreen"; // Adjust the import path as needed

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SpaceLoadingScreen", () => {
  test("renders initial loading message", () => {
    render(<SpaceLoadingScreen />);
    // Check if the first loading message is displayed
    expect(
      screen.getByText("Initialising systems", { exact: false })
    ).toBeInTheDocument();
  });
});
