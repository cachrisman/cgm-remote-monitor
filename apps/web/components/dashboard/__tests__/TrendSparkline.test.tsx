import { render, screen } from "@testing-library/react";

import { TrendSparkline } from "../TrendSparkline";

describe("TrendSparkline", () => {
  it("renders an empty path when no entries are provided", () => {
    render(<TrendSparkline entries={[]} />);

    const path = screen.getByTestId("sparkline-path");
    expect(path).toHaveAttribute("d", "");
  });

  it("generates a smoothed path for glucose entries", () => {
    render(
      <TrendSparkline
        entries={[
          { mgdl: 90, direction: "Flat", measuredAt: "2024-04-18T12:00:00.000Z" },
          { mgdl: 120, direction: "FortyFiveUp", measuredAt: "2024-04-18T12:05:00.000Z" },
          { mgdl: 150, direction: "Flat", measuredAt: "2024-04-18T12:10:00.000Z" }
        ]}
      />
    );

    const path = screen.getByTestId("sparkline-path");
    expect(path.getAttribute("d")).toMatch(/^M0.00 \d+\.\d+ L60.00 \d+\.\d+ L120.00 \d+\.\d+$/);
  });
});
