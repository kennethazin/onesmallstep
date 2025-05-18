import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest"; // Vitest imports

import AgcConnectionIndicator from "../AgcConnectionIndicator";

describe("AgcConnectionIndicator", () => {
  // Test case 1: When connected prop is true
  it('should display "AGC: Connected" when connected is true', () => {
    render(<AgcConnectionIndicator connected={true} />);
    screen.debug();
    const connectedText = screen.getByText("AGC: Connected");

    // Assert that the element is in the document
    expect(connectedText).toBeInTheDocument();

    expect(screen.queryByText("AGC: Disconnected")).not.toBeInTheDocument();
  });

  // Test case 2: When connected prop is false
  it('should display "AGC: Disconnected" when connected is false', () => {
    render(<AgcConnectionIndicator connected={false} />);
    screen.debug();

    const disconnectedText = screen.getByText("AGC: Disconnected");

    // Assert that the element is in the document
    expect(disconnectedText).toBeInTheDocument();

    expect(screen.queryByText("AGC: Connected")).not.toBeInTheDocument();
  });
});
