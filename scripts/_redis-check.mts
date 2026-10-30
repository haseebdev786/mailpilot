import IORedis from "ioredis";
const r = new IORedis("redis://localhost:6379", { connectTimeout: 4000, maxRetriesPerRequest: 1, retryStrategy: () => null });
r.on("error", () => {});
try { console.log("REDIS:", await r.ping()); } catch (e) { console.log("REDIS FAIL:", e.message); }
r.disconnect();
