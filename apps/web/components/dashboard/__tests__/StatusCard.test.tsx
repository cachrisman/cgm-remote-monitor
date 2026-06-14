import { render, screen } from "@testing-library/react";

import { StatusCard } from "../StatusCard";

describe("StatusCard", () => {
  it("renders title, value, and description", () => {
    render(
      <StatusCard title="Glucose" value="110 mg/dL" description="Flat" tone="success" />
    );

    expect(screen.getByRole("heading", { name: /glucose/i })).toBeInTheDocument();
    expect(screen.getByText("110 mg/dL")).toBeInTheDocument();
    expect(screen.getByText("Flat")).toBeInTheDocument();
  });

  it("applies tone styles", () => {
    const { container, rerender } = render(
      <StatusCard title="Status" value="OK" tone="warning" />
    );

    expect(container.firstChild).toHaveClass("bg-amber-900/40");

    rerender(<StatusCard title="Status" value="OK" tone="danger" />);
    expect(container.firstChild).toHaveClass("bg-rose-900/40");
  });
});
