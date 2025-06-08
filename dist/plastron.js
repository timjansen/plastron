"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlastron = void 0;
// Default configuration values
const defaultOptions = {
    ipMonitorSize: 1000,
    maxRequestRatePerSec: 0,
    maxRequestNegativeIPperSec: 0,
    maxSimultanousConnectionsPerIP: 25,
    maxSimultanousConnectionsNegativePerIP: 10,
    maxReqPerSecPerIP: 30,
    maxReqNegativePerSecPerIP: 10,
    ipSlowDownStartsAt: -100000,
    ipSlowDownMaxS: 5000,
    ipSlowDownMaxPunishmentAt: -500000,
    excessiveReqPerS: 50,
    excessiveReqPerMin: 200,
    pointsForExcessiveRequest: -100,
    pointsFor20x: 1,
    pointsFor30x: 0,
    pointsFor400: -10000,
    pointsFor401: -10000,
    pointsFor404: -100,
    pointsFor40x: -10,
    pointsFor50x: -20,
    enableDebug: false,
    logger: console.log,
    nowFn: undefined
};
// Global random modifier created once for all instances
const globalRandomModifier = Math.floor(Math.random() * 1000);
function createNowFunction() {
    return () => Date.now() + globalRandomModifier;
}
function getClientIp(req) {
    return req.ip ||
        req.socket?.remoteAddress ||
        '*error*';
}
function updateTimeWindows(ipData, nowMs) {
    const currentMin = Math.ceil(nowMs / 60000);
    const current10Sec = Math.ceil(nowMs / 10000);
    const lastMin = Math.ceil(ipData.lastSeenMs / 60000);
    const last10Sec = Math.ceil(ipData.lastSeenMs / 10000);
    // Update minute windows
    if (currentMin != lastMin) {
        if (currentMin == lastMin + 1)
            ipData.reqInPrevMin = ipData.reqInCurrentMin;
        else
            ipData.reqInPrevMin = 0;
        ipData.reqInCurrentMin = 0;
    }
    // Update 10-second windows
    if (current10Sec != last10Sec) {
        if (current10Sec == last10Sec + 1)
            ipData.reqInPrev10Sec = ipData.reqInCurrent10Sec;
        else
            ipData.reqInPrev10Sec = 0;
        ipData.reqInCurrent10Sec = 0;
    }
}
function updateGlobalStats(globalStats, nowMs) {
    const currentSec = Math.ceil(nowMs / 1000);
    const prevSec = Math.ceil(globalStats.prevSecStartMs / 1000);
    const currentMin = Math.ceil(nowMs / 60000);
    const prevMin = Math.ceil(globalStats.currentMinStartMs / 60000);
    if (currentSec != prevSec) {
        globalStats.reqInPrevSec = globalStats.reqInCurrentSec;
        globalStats.reqInCurrentSec = 0;
        globalStats.negativeReqInCurrentSec = 0;
        globalStats.prevSecStartMs = globalStats.currentSecStartMs;
        globalStats.currentSecStartMs = nowMs;
    }
    if (currentMin != prevMin) {
        globalStats.reqInPrevMin = globalStats.reqInCurrentMin;
        globalStats.reqInCurrentMin = 0;
        globalStats.rateLimited429InPrevMin = globalStats.rateLimited429InCurrentMin;
        globalStats.rateLimited429InCurrentMin = 0;
        globalStats.currentMinStartMs = nowMs;
    }
}
function calculateCurrentReqPerSec(globalStats, nowMs) {
    const timeSincePrevSec = Math.max(1, (nowMs - globalStats.prevSecStartMs) / 1000);
    return (globalStats.reqInCurrentSec + globalStats.reqInPrevSec) / timeSincePrevSec;
}
function calculate10SecReqPerSec(ipData) {
    return (ipData.reqInCurrent10Sec + ipData.reqInPrev10Sec) / 10;
}
function findEvictableIndex(monitoredIps, ipData, options, nowMs) {
    const size = monitoredIps.length;
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
        const randomIndex = Math.floor(Math.random() * size);
        const ip = monitoredIps[randomIndex];
        if (!ip) {
            return randomIndex;
        }
        const data = ipData.get(ip);
        if (!data) {
            return randomIndex;
        }
        // Check if this IP is in preferred eviction range and was seen recently
        const isRecentlyActive = (nowMs - data.lastSeenMs) < 300000; // 5 minutes
        const isInPreferredRange = data.points >= -50000 && data.points <= 50000;
        if (!isInPreferredRange || !isRecentlyActive || attempts == maxAttempts - 1) {
            return randomIndex;
        }
        attempts++;
    }
    // Fallback - just return a random index
    return Math.floor(Math.random() * size);
}
function addIpToMonitoring(ip, monitoredIps, ipData, opts, nowMs) {
    const evictIndex = findEvictableIndex(monitoredIps, ipData, opts, nowMs);
    // Remove old IP if exists
    const oldIp = monitoredIps[evictIndex];
    if (oldIp)
        ipData.delete(oldIp);
    // Add new IP
    const newIpData = {
        ip,
        index: evictIndex,
        lastSeenMs: nowMs,
        points: 0,
        connections: 0,
        reqInCurrentMin: 0,
        reqInPrevMin: 0,
        reqInCurrent10Sec: 0,
        reqInPrev10Sec: 0
    };
    monitoredIps[evictIndex] = ip;
    ipData.set(ip, newIpData);
    if (opts.enableDebug && opts.logger)
        opts.logger(`New IP added to monitoring: ${ip}`);
    return newIpData;
}
function calculateSlowdown(points, options) {
    if (points >= options.ipSlowDownStartsAt)
        return 0;
    const range = options.ipSlowDownStartsAt - options.ipSlowDownMaxPunishmentAt;
    const position = Math.max(0, options.ipSlowDownStartsAt - points);
    const ratio = Math.min(1, position / range);
    return Math.max(100, ratio * options.ipSlowDownMaxS);
}
function calculateMaxConnections(points, options) {
    const baseMax = points >= 0 ? options.maxSimultanousConnectionsPerIP : options.maxSimultanousConnectionsNegativePerIP;
    if (points >= options.ipSlowDownStartsAt)
        return baseMax;
    const range = options.ipSlowDownStartsAt - options.ipSlowDownMaxPunishmentAt;
    const position = Math.max(0, options.ipSlowDownStartsAt - points);
    const ratio = Math.min(1, position / range);
    return Math.max(1, Math.floor(baseMax * (1 - ratio)));
}
function calculatePoints(statusCode, options) {
    if (statusCode >= 200 && statusCode < 300)
        return options.pointsFor20x;
    if (statusCode >= 300 && statusCode < 400)
        return options.pointsFor30x;
    if (statusCode == 400)
        return options.pointsFor400;
    if (statusCode == 401)
        return options.pointsFor401;
    if (statusCode == 404)
        return options.pointsFor404;
    if (statusCode >= 400 && statusCode < 500)
        return options.pointsFor40x;
    if (statusCode >= 500 && statusCode < 600)
        return options.pointsFor50x;
    return 0;
}
function checkExcessiveUsage(ipData, options) {
    let penalty = 0;
    const reqPer10Sec = calculate10SecReqPerSec(ipData);
    if (reqPer10Sec > options.excessiveReqPerS)
        penalty += options.pointsForExcessiveRequest;
    const reqPerMin = (ipData.reqInCurrentMin + ipData.reqInPrevMin) / 60;
    if (reqPerMin > options.excessiveReqPerMin)
        penalty += options.pointsForExcessiveRequest;
    return penalty;
}
function createRateLimitResponse(res, opts, ip, globalStats, reason) {
    const payload = { error: opts.rateLimitMessage };
    if (opts.enableDebug && reason) {
        payload.reason = reason;
    }
    // Track 429 responses for happy-server metrics
    globalStats.rateLimited429InCurrentMin++;
    if (opts.logger)
        opts.logger(`Request blocked (429) - IP: ${ip}, Reason: ${reason || 'Rate limit exceeded'}`);
    return res.status(429).json(payload);
}
function createPlastron(userOptions) {
    if (!userOptions.rateLimitMessage)
        throw new Error('rateLimitMessage is required in PlastronOptions');
    const opts = {
        ...defaultOptions,
        ...userOptions,
        nowFn: userOptions.nowFn || createNowFunction()
    };
    // Internal state
    const monitoredIps = new Array(opts.ipMonitorSize).fill(undefined);
    const ipData = new Map();
    const globalStats = {
        reqInCurrentSec: 0,
        reqInPrevSec: 0,
        prevSecStartMs: opts.nowFn(),
        currentSecStartMs: opts.nowFn(),
        negativeReqInCurrentSec: 0,
        reqInCurrentMin: 0,
        reqInPrevMin: 0,
        rateLimited429InCurrentMin: 0,
        rateLimited429InPrevMin: 0,
        currentMinStartMs: opts.nowFn()
    };
    const middleware = (req, res, next) => {
        const nowMs = opts.nowFn();
        const ip = getClientIp(req);
        // Update global stats
        updateGlobalStats(globalStats, nowMs);
        // Get or create IP data
        let ipEntry = ipData.get(ip);
        if (!ipEntry)
            ipEntry = addIpToMonitoring(ip, monitoredIps, ipData, opts, nowMs);
        // Update IP time windows
        updateTimeWindows(ipEntry, nowMs);
        ipEntry.lastSeenMs = nowMs;
        // Check global rate limits
        const globalReqPerSec = calculateCurrentReqPerSec(globalStats, nowMs);
        if (opts.maxRequestRatePerSec > 0 && globalReqPerSec >= opts.maxRequestRatePerSec)
            return createRateLimitResponse(res, opts, ip, globalStats, `Global rate limit exceeded: ${globalReqPerSec.toFixed(2)} req/sec`);
        if (opts.maxRequestNegativeIPperSec > 0 &&
            ipEntry.points < 0 &&
            globalStats.negativeReqInCurrentSec >= opts.maxRequestNegativeIPperSec)
            return createRateLimitResponse(res, opts, ip, globalStats, `Global negative IP rate limit exceeded: ${globalStats.negativeReqInCurrentSec} req/sec`);
        // Check IP-specific rate limits
        const reqPer10Sec = calculate10SecReqPerSec(ipEntry);
        const maxReqPerSec = ipEntry.points >= 0 ? opts.maxReqPerSecPerIP : opts.maxReqNegativePerSecPerIP;
        if (reqPer10Sec >= maxReqPerSec)
            return createRateLimitResponse(res, opts, ip, globalStats, `IP rate limit exceeded: ${reqPer10Sec.toFixed(2)} req/sec (limit: ${maxReqPerSec})`);
        // Check connection limits
        const maxConns = calculateMaxConnections(ipEntry.points, opts);
        if (ipEntry.connections >= maxConns)
            return createRateLimitResponse(res, opts, ip, globalStats, `Connection limit exceeded: ${ipEntry.connections} connections (limit: ${maxConns})`);
        // Calculate slowdown
        const slowdownMs = calculateSlowdown(ipEntry.points, opts);
        // Increment counters
        globalStats.reqInCurrentSec++;
        globalStats.reqInCurrentMin++;
        if (ipEntry.points < 0)
            globalStats.negativeReqInCurrentSec++;
        ipEntry.reqInCurrentMin++;
        ipEntry.reqInCurrent10Sec++;
        ipEntry.connections++;
        // Apply slowdown if needed
        const processRequest = () => {
            // Set up response handler to update points based on status code
            const origSend = res.send;
            res.send = function (body) {
                const statusCode = res.statusCode;
                const pts = calculatePoints(statusCode, opts);
                const excessivePenalty = checkExcessiveUsage(ipEntry, opts);
                const wasPositive = ipEntry.points >= 0;
                ipEntry.points += pts + excessivePenalty;
                ipEntry.connections = Math.max(0, ipEntry.connections - 1);
                // Log if IP goes negative
                if (opts.enableDebug && opts.logger && wasPositive && ipEntry.points < 0)
                    opts.logger(`IP went negative: ${ip}, points: ${ipEntry.points}`);
                return origSend.call(this, body);
            };
            next();
        };
        if (slowdownMs > 0)
            setTimeout(processRequest, slowdownMs);
        else
            processRequest();
    };
    const addPointsToIp = (ipOrReq, pts) => {
        const ip = typeof ipOrReq == 'string' ? ipOrReq : getClientIp(ipOrReq);
        const data = ipData.get(ip);
        if (data) {
            const oldPts = data.points;
            const wasPositive = oldPts >= 0;
            data.points += pts;
            if (opts.enableDebug && opts.logger) {
                opts.logger(`addPointsToIp called - IP: ${ip}, added: ${pts}, total: ${data.points}`);
                if (wasPositive && data.points < 0)
                    opts.logger(`IP went negative: ${ip}, points: ${data.points}`);
            }
            return true;
        }
        return false;
    };
    const getIpData = (ip) => {
        return ipData.get(ip);
    };
    const getStats = () => ({
        totalMonitoredIps: ipData.size,
        globalStats: { ...globalStats }
    });
    // Add happy-server extension if available
    const registerHappyServerExtension = () => {
        if (typeof globalThis.happyServerExtension == 'object') {
            globalThis.happyServerExtension['plastron'] = () => {
                const nowMs = opts.nowFn();
                let positiveIps = 0;
                let negativeIps = 0;
                let worstIp;
                // Analyze all monitored IPs
                for (const [ip, data] of ipData) {
                    if (data.points >= 0) {
                        positiveIps++;
                    }
                    else {
                        negativeIps++;
                        if (!worstIp || data.points < worstIp.score) {
                            worstIp = { ip, score: data.points };
                        }
                    }
                }
                // Calculate current 429 rate in the minute  
                const totalRateLimited = globalStats.rateLimited429InCurrentMin + globalStats.rateLimited429InPrevMin;
                const totalRequestsLastMinute = globalStats.reqInCurrentMin + globalStats.reqInPrevMin;
                return {
                    status: 'ok',
                    totalMonitoredIps: ipData.size,
                    positiveScoreIps: positiveIps,
                    negativeScoreIps: negativeIps,
                    worstIp: worstIp || undefined,
                    rateLimited429LastMinute: totalRateLimited,
                    totalRequestsLastMinute: totalRequestsLastMinute,
                    globalRequestsPerSecond: calculateCurrentReqPerSec(globalStats, nowMs)
                };
            };
            return true;
        }
        return false;
    };
    // Try to register immediately, if not available retry after 3 seconds
    if (!registerHappyServerExtension()) {
        setTimeout(() => registerHappyServerExtension(), 3000);
    }
    return {
        middleware,
        addPointsToIp,
        getIpData,
        getStats
    };
}
exports.createPlastron = createPlastron;
