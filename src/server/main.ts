import { startServer } from "./hub";

const port = Number(process.env.PORT) || 47231;
const running = await startServer({ port, dev: process.env.NODE_ENV !== "production" });
console.log(`Le Feutre écoute sur http://0.0.0.0:${running.port}`);
