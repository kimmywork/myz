#!/usr/bin/env node

import { start, shutdownBrowser } from '../src/mcp-server.js';


start()
process.on('SIGINT', async () => { await shutdownBrowser(); process.exit(0) })
process.on('SIGTERM', async () => { await shutdownBrowser(); process.exit(0) })
