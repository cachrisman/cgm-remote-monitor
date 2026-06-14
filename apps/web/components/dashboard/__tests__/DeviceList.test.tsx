import { render, screen } from "@testing-library/react";
import { DeviceList } from "../DeviceList";

const devices = [
  { name: "Pump", status: "Connected", lastUpdated: "2024-03-01T12:00:00Z" },
  { name: "CGM", status: "Warming up", lastUpdated: null }
];

describe("DeviceList", () => {
  it("renders device cards when devices are provided", () => {
    render(<DeviceList devices={devices} />);

    expect(screen.getByText("Pump")).toBeInTheDocument();
    expect(screen.getByText("CGM")).toBeInTheDocument();
  });

  it("renders an empty state when no devices exist", () => {
    render(<DeviceList devices={[]} />);

    expect(
      screen.getByText(
        /configure device integrations in the admin console/i
      )
    ).toBeInTheDocument();
  });
});
