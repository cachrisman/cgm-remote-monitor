import { getApiBaseUrl } from "@/lib/env";

describe("getApiBaseUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_NIGHTSCOUT_API_BASE_URL;
    delete process.env.NIGHTSCOUT_API_BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the fallback url when no environment variables are set", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:1337/api/v1");
  });

  it("prefers the public environment variable", () => {
    process.env.NEXT_PUBLIC_NIGHTSCOUT_API_BASE_URL = "https://demo.nightscout.dev/api/v1/";
    process.env.NIGHTSCOUT_API_BASE_URL = "https://should-not-be-used.example.com";

    expect(getApiBaseUrl()).toBe("https://demo.nightscout.dev/api/v1");
  });

  it("falls back to the private environment variable", () => {
    process.env.NIGHTSCOUT_API_BASE_URL = " https://demo-private.example.com/api/v1/ ";

    expect(getApiBaseUrl()).toBe("https://demo-private.example.com/api/v1");
  });
});
