import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest"; // Import vi for mocking functions
import MissionChecklist from "../MissionChecklist"; // Adjust the import path as needed

describe("MissionChecklist", () => {
  const mockItems = [
    { id: "item-1", text: "Check item 1", checked: false, required: true },
    { id: "item-2", text: "Check item 2", checked: false, required: false },
    {
      id: "item-3",
      text: "Check item 3 (Required)",
      checked: false,
      required: true,
    },
  ];

  const defaultProps = {
    title: "Mission Checklist",
    items: mockItems,
    onComplete: vi.fn(),
    canProceed: false,
    missionType: "launch",
    waitingForAGC: false,
  };

  test("renders the title and mission type heading", () => {
    render(<MissionChecklist {...defaultProps} />);

    expect(screen.getByText("Mission Checklist")).toBeInTheDocument();
    expect(screen.getByText("PRE-LAUNCH VERIFICATION")).toBeInTheDocument(); // Assuming launch mission type
  });

  test("proceed button is disabled when required items are not checked (not waiting for AGC)", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={true}
        waitingForAGC={false}
      />
    );

    const proceedButton = screen.getByText("INITIATE LAUNCH SEQUENCE");
    expect(proceedButton).toBeDisabled();
  });

  test("proceed button is enabled when all required items are checked (not waiting for AGC)", () => {
    const itemsWithRequiredChecked = mockItems.map((item) =>
      item.required ? { ...item, checked: true } : item
    );
    render(
      <MissionChecklist
        {...defaultProps}
        items={itemsWithRequiredChecked}
        canProceed={true}
        waitingForAGC={false}
      />
    );

    const proceedButton = screen.getByText("INITIATE LAUNCH SEQUENCE");
    expect(proceedButton).toBeEnabled();
  });

  test("proceed button is enabled when waitingForAGC is true, regardless of required items", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={true}
        waitingForAGC={true}
      />
    );

    const proceedButton = screen.getByText("INITIATE LAUNCH SEQUENCE");
    expect(proceedButton).toBeEnabled();
  });

  test("proceed button is disabled when canProceed is false, even if required items are checked or waitingForAGC is true", () => {
    const itemsWithRequiredChecked = mockItems.map((item) =>
      item.required ? { ...item, checked: true } : item
    );
    const { rerender } = render(
      <MissionChecklist
        {...defaultProps}
        items={itemsWithRequiredChecked}
        canProceed={false}
        waitingForAGC={false}
      />
    );

    const proceedButton = screen.getByText("INITIATE LAUNCH SEQUENCE");
    expect(proceedButton).toBeDisabled();

    rerender(
      <MissionChecklist
        {...defaultProps}
        canProceed={false}
        waitingForAGC={true}
      />
    );
    expect(proceedButton).toBeDisabled();
  });

  test("calls onComplete when the enabled proceed button is clicked", () => {
    const handleComplete = vi.fn();
    const itemsWithRequiredChecked = mockItems.map((item) =>
      item.required ? { ...item, checked: true } : item
    );
    render(
      <MissionChecklist
        {...defaultProps}
        items={itemsWithRequiredChecked}
        onComplete={handleComplete}
        canProceed={true}
        waitingForAGC={false}
      />
    );

    const proceedButton = screen.getByText("INITIATE LAUNCH SEQUENCE");
    fireEvent.click(proceedButton);

    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  test('shows "Complete all required items" message when required items are not checked and not waiting for AGC', () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={true}
        waitingForAGC={false}
      />
    );
    expect(
      screen.getByText("Complete all required items (✱) to proceed")
    ).toBeInTheDocument();
  });

  test('does not show "Complete all required items" message when all required items are checked', () => {
    const itemsWithRequiredChecked = mockItems.map((item) =>
      item.required ? { ...item, checked: true } : item
    );
    render(
      <MissionChecklist
        {...defaultProps}
        items={itemsWithRequiredChecked}
        canProceed={true}
        waitingForAGC={false}
      />
    );
    expect(
      screen.queryByText("Complete all required items (✱) to proceed")
    ).not.toBeInTheDocument();
  });

  test('does not show "Complete all required items" message when waiting for AGC is true', () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={true}
        waitingForAGC={true}
      />
    );
    expect(
      screen.queryByText("Complete all required items (✱) to proceed")
    ).not.toBeInTheDocument();
  });

  test("shows AGC waiting message when waitingForAGC is true and canProceed is false", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={false}
        waitingForAGC={true}
      />
    );
    expect(
      screen.getByText(
        "Waiting for Saturn V launch program to be loaded in AGC..."
      )
    ).toBeInTheDocument();
  });

  test("does not show AGC waiting message when waitingForAGC is false", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={false}
        waitingForAGC={false}
      />
    );
    expect(
      screen.queryByText(
        "Waiting for Saturn V launch program to be loaded in AGC..."
      )
    ).not.toBeInTheDocument();
  });

  test("shows AGC detected status when waitingForAGC is true and canProceed is true", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={true}
        waitingForAGC={true}
      />
    );
    expect(
      screen.getByText("AGC LAUNCH PROGRAM: DETECTED")
    ).toBeInTheDocument();
  });

  test("shows AGC waiting status when waitingForAGC is true and canProceed is false", () => {
    render(
      <MissionChecklist
        {...defaultProps}
        canProceed={false}
        waitingForAGC={true}
      />
    );
    expect(screen.getByText("AGC LAUNCH PROGRAM: WAITING")).toBeInTheDocument();
  });

  test("uses correct proceed button text for landing mission", () => {
    render(<MissionChecklist {...defaultProps} missionType="landing" />);
    expect(screen.getByText("BEGIN LUNAR DESCENT")).toBeInTheDocument();
    expect(screen.getByText("LUNAR DESCENT PREPARATION")).toBeInTheDocument();
  });
});
