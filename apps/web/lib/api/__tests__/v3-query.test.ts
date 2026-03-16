import { parseV3Query, applyFieldProjection, buildProjection } from "../v3-query";

describe("V3 Query Handler", () => {
  describe("parseV3Query", () => {
    it("returns default values for empty params", () => {
      const params = new URLSearchParams();
      const query = parseV3Query(params);
      
      expect(query.filter).toEqual({});
      expect(query.limit).toBe(10);
      expect(query.skip).toBe(0);
      expect(query.sort).toEqual({ srvModified: -1 });
    });

    it("parses limit parameter", () => {
      const params = new URLSearchParams("limit=50");
      const query = parseV3Query(params);
      
      expect(query.limit).toBe(50);
    });

    it("enforces max limit", () => {
      const params = new URLSearchParams("limit=2000");
      const query = parseV3Query(params, { maxLimit: 1000 });
      
      expect(query.limit).toBe(1000);
    });

    it("parses skip parameter", () => {
      const params = new URLSearchParams("skip=20");
      const query = parseV3Query(params);
      
      expect(query.skip).toBe(20);
    });

    it("parses ascending sort", () => {
      const params = new URLSearchParams("sort=date");
      const query = parseV3Query(params);
      
      expect(query.sort).toEqual({ date: 1 });
    });

    it("parses descending sort", () => {
      const params = new URLSearchParams("sort$desc=date");
      const query = parseV3Query(params);
      
      expect(query.sort).toEqual({ date: -1 });
    });

    it("parses fields parameter", () => {
      const params = new URLSearchParams("fields=date,sgv,direction");
      const query = parseV3Query(params);
      
      expect(query.fields).toEqual(["date", "sgv", "direction"]);
    });

    it("ignores _all fields value", () => {
      const params = new URLSearchParams("fields=_all");
      const query = parseV3Query(params);
      
      expect(query.fields).toBeUndefined();
    });

    describe("filter operators", () => {
      it("parses $eq operator", () => {
        const params = new URLSearchParams("type$eq=sgv");
        const query = parseV3Query(params);
        
        expect(query.filter.type).toEqual({ $eq: "sgv" });
      });

      it("parses $ne operator", () => {
        const params = new URLSearchParams("type$ne=mbg");
        const query = parseV3Query(params);
        
        expect(query.filter.type).toEqual({ $ne: "mbg" });
      });

      it("parses $gt operator", () => {
        const params = new URLSearchParams("sgv$gt=180");
        const query = parseV3Query(params);
        
        expect(query.filter.sgv).toEqual({ $gt: 180 });
      });

      it("parses $gte operator", () => {
        const params = new URLSearchParams("sgv$gte=180");
        const query = parseV3Query(params);
        
        expect(query.filter.sgv).toEqual({ $gte: 180 });
      });

      it("parses $lt operator", () => {
        const params = new URLSearchParams("sgv$lt=70");
        const query = parseV3Query(params);
        
        expect(query.filter.sgv).toEqual({ $lt: 70 });
      });

      it("parses $lte operator", () => {
        const params = new URLSearchParams("sgv$lte=70");
        const query = parseV3Query(params);
        
        expect(query.filter.sgv).toEqual({ $lte: 70 });
      });

      it("parses $in operator", () => {
        const params = new URLSearchParams("type$in=sgv|mbg|cal");
        const query = parseV3Query(params);
        
        expect(query.filter.type).toEqual({ $in: ["sgv", "mbg", "cal"] });
      });

      it("parses $nin operator", () => {
        const params = new URLSearchParams("eventType$nin=Temp Basal|Note");
        const query = parseV3Query(params);
        
        expect(query.filter.eventType).toEqual({ $nin: ["Temp Basal", "Note"] });
      });

      it("parses $re operator", () => {
        const params = new URLSearchParams("eventType$re=Temp.*");
        const query = parseV3Query(params);
        
        expect(query.filter.eventType).toEqual({ $regex: "Temp.*", $options: "i" });
      });

      it("parses plain field as $eq", () => {
        const params = new URLSearchParams("type=sgv");
        const query = parseV3Query(params);
        
        expect(query.filter.type).toEqual({ $eq: "sgv" });
      });

      it("combines multiple operators on same field", () => {
        const params = new URLSearchParams("sgv$gte=70&sgv$lte=180");
        const query = parseV3Query(params);
        
        expect(query.filter.sgv).toEqual({ $gte: 70, $lte: 180 });
      });
    });

    describe("date handling", () => {
      it("converts epoch milliseconds to number", () => {
        const params = new URLSearchParams("date$gte=1525383610088");
        const query = parseV3Query(params, { dateFields: ["date"] });
        
        expect(query.filter.date).toEqual({ $gte: 1525383610088 });
      });

      it("converts epoch seconds to milliseconds", () => {
        const params = new URLSearchParams("date$gte=1525383610");
        const query = parseV3Query(params, { dateFields: ["date"] });
        
        expect(query.filter.date).toEqual({ $gte: 1525383610000 });
      });

      it("parses ISO 8601 date", () => {
        const params = new URLSearchParams("date$gte=2018-05-03T21:40:10.088Z");
        const query = parseV3Query(params, { dateFields: ["date"] });
        
        const expected = Date.parse("2018-05-03T21:40:10.088Z");
        expect(query.filter.date).toEqual({ $gte: expected });
      });
    });
  });

  describe("applyFieldProjection", () => {
    const docs = [
      { _id: "1", identifier: "id1", date: 123, sgv: 110, direction: "Flat" },
      { _id: "2", identifier: "id2", date: 456, sgv: 120, direction: "FortyFiveUp" }
    ];

    it("returns all fields when no projection", () => {
      const result = applyFieldProjection(docs);
      expect(result).toEqual(docs);
    });

    it("returns only specified fields plus _id and identifier", () => {
      const result = applyFieldProjection(docs, ["sgv"]);
      
      expect(result).toEqual([
        { _id: "1", identifier: "id1", sgv: 110 },
        { _id: "2", identifier: "id2", sgv: 120 }
      ]);
    });

    it("returns multiple specified fields", () => {
      const result = applyFieldProjection(docs, ["sgv", "direction"]);
      
      expect(result).toEqual([
        { _id: "1", identifier: "id1", sgv: 110, direction: "Flat" },
        { _id: "2", identifier: "id2", sgv: 120, direction: "FortyFiveUp" }
      ]);
    });
  });

  describe("buildProjection", () => {
    it("returns undefined for no fields", () => {
      expect(buildProjection()).toBeUndefined();
      expect(buildProjection([])).toBeUndefined();
    });

    it("includes _id and identifier by default", () => {
      const projection = buildProjection(["sgv"]);
      
      expect(projection).toEqual({ _id: 1, identifier: 1, sgv: 1 });
    });

    it("includes multiple fields", () => {
      const projection = buildProjection(["sgv", "direction", "date"]);
      
      expect(projection).toEqual({
        _id: 1,
        identifier: 1,
        sgv: 1,
        direction: 1,
        date: 1
      });
    });
  });
});

