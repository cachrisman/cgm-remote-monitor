import { render, screen } from "@testing-library/react";
import { MetricCard } from "../MetricCard";

describe("MetricCard", () => {
  it("renders title and value", () => {
    render(<MetricCard title="Average" value="120 mg/dL" />);

    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("120 mg/dL")).toBeInTheDocument();
  });
});
