import { createNightscoutClient } from "@/lib/nightscout-client";

describe("Nightscout client", () => {
  const baseUrl = "https://nightscout.example.com/api/v1";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getRecentEntries", () => {
    it("requests the entries endpoint with the provided limit", async () => {
      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              {
                sgv: 180,
                direction: "Flat",
                dateString: "2024-04-18T12:00:00.000Z"
              }
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const client = createNightscoutClient({ baseUrl });
      const result = await client.getRecentEntries(3);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestedUrl, options] = fetchMock.mock.calls[0];
      expect(String(requestedUrl)).toBe(`${baseUrl}/entries.json?count=3`);
      expect(options).toMatchObject({ next: { revalidate: 30 } });
      expect(result).toEqual([
        {
          direction: "Flat",
          measuredAt: "2024-04-18T12:00:00.000Z",
          mgdl: 180
        }
      ]);
    });

    it("filters out malformed entries", async () => {
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              sgv: 120,
              direction: "FortyFiveUp",
              dateString: "2024-04-18T12:05:00.000Z"
            },
            { sgv: "bad", dateString: null }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const client = createNightscoutClient({ baseUrl: `${baseUrl}/custom` });

      const entries = await client.getRecentEntries();
      expect(entries).toEqual([
        {
          direction: "FortyFiveUp",
          measuredAt: "2024-04-18T12:05:00.000Z",
          mgdl: 120
        }
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws when the API responds with an error", async () => {
      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("error", { status: 500 }));

      const client = createNightscoutClient({ baseUrl: `${baseUrl}/errors` });

      await expect(client.getRecentEntries()).rejects.toThrow(
        "Nightscout API request failed (500): error"
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getStatus", () => {
    it("maps the status summary and device list", async () => {
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            status: { state: "ok" },
            devices: [
              {
                name: "CGM",
                status: "Connected",
                lastUpdated: "2024-04-18T12:10:00.000Z"
              },
              {
                name: 42,
                status: null,
                lastUpdated: 0
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const client = createNightscoutClient({ baseUrl });
      const status = await client.getStatus();

      const [requestedUrl, options] = fetchMock.mock.calls[0];
      expect(String(requestedUrl)).toBe(`${baseUrl}/status.json`);
      expect(options).toMatchObject({ next: { revalidate: 30 } });
      expect(status).toEqual({
        state: "ok",
        devices: [
          {
            lastUpdated: "2024-04-18T12:10:00.000Z",
            name: "CGM",
            status: "Connected"
          },
          {
            lastUpdated: null,
            name: "Unknown",
            status: "Unavailable"
          }
        ]
      });
    });
  });
});
