import "@testing-library/jest-dom";
import "whatwg-fetch";
import { TextDecoder, TextEncoder } from "util";

if (!global.TextEncoder) {
  (global as typeof globalThis).TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
}

if (!global.TextDecoder) {
  (global as typeof globalThis).TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
}

export {}; // ensure this file is treated as a module
