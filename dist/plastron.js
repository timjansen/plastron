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
    if (currentSec != prevSec) {
        globalStats.reqInPrevSec = globalStats.reqInCurrentSec;
        globalStats.reqInCurrentSec = 0;
        globalStats.negativeReqInCurrentSec = 0;
        globalStats.prevSecStartMs = globalStats.currentSecStartMs;
        globalStats.currentSecStartMs = nowMs;
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
function addIpToMonitoring(ip, monitoredIps, ipData, options, nowMs) {
    const evictIndex = findEvictableIndex(monitoredIps, ipData, options, nowMs);
    // Remove old IP if exists
    const oldIp = monitoredIps[evictIndex];
    if (oldIp) {
        ipData.delete(oldIp);
    }
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
    return newIpData;
}
function calculateSlowdown(points, options) {
    if (points >= options.ipSlowDownStartsAt) {
        return 0;
    }
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
function createPlastron(userOptions) {
    if (!userOptions.rateLimitMessage)
        throw new Error('rateLimitMessage is required in PlastronOptions');
    const options = {
        ...defaultOptions,
        ...userOptions,
        nowFn: userOptions.nowFn || createNowFunction()
    };
    // Internal state
    const monitoredIps = new Array(options.ipMonitorSize).fill(undefined);
    const ipData = new Map();
    const globalStats = {
        reqInCurrentSec: 0,
        reqInPrevSec: 0,
        prevSecStartMs: options.nowFn(),
        currentSecStartMs: options.nowFn(),
        negativeReqInCurrentSec: 0
    };
    const middleware = (req, res, next) => {
        const nowMs = options.nowFn();
        const ip = getClientIp(req);
        // Update global stats
        updateGlobalStats(globalStats, nowMs);
        // Get or create IP data
        let ipDataEntry = ipData.get(ip);
        if (!ipDataEntry)
            ipDataEntry = addIpToMonitoring(ip, monitoredIps, ipData, options, nowMs);
        // Update IP time windows
        updateTimeWindows(ipDataEntry, nowMs);
        ipDataEntry.lastSeenMs = nowMs;
        // Check global rate limits
        const currentGlobalReqPerSec = calculateCurrentReqPerSec(globalStats, nowMs);
        if (options.maxRequestRatePerSec > 0 && currentGlobalReqPerSec >= options.maxRequestRatePerSec)
            return res.status(429).json({ error: options.rateLimitMessage });
        if (options.maxRequestNegativeIPperSec > 0 &&
            ipDataEntry.points < 0 &&
            globalStats.negativeReqInCurrentSec >= options.maxRequestNegativeIPperSec)
            return res.status(429).json({ error: options.rateLimitMessage });
        // Check IP-specific rate limits
        const reqPer10Sec = calculate10SecReqPerSec(ipDataEntry);
        const maxReqPerSec = ipDataEntry.points >= 0 ? options.maxReqPerSecPerIP : options.maxReqNegativePerSecPerIP;
        if (reqPer10Sec >= maxReqPerSec)
            return res.status(429).json({ error: options.rateLimitMessage });
        // Check connection limits
        const maxConnections = calculateMaxConnections(ipDataEntry.points, options);
        if (ipDataEntry.connections >= maxConnections)
            return res.status(429).json({ error: options.rateLimitMessage });
        // Calculate slowdown
        const slowdownMs = calculateSlowdown(ipDataEntry.points, options);
        // Increment counters
        globalStats.reqInCurrentSec++;
        if (ipDataEntry.points < 0)
            globalStats.negativeReqInCurrentSec++;
        ipDataEntry.reqInCurrentMin++;
        ipDataEntry.reqInCurrent10Sec++;
        ipDataEntry.connections++;
        // Apply slowdown if needed
        const processRequest = () => {
            // Set up response handler to update points based on status code
            const originalSend = res.send;
            res.send = function (body) {
                const statusCode = res.statusCode;
                const points = calculatePoints(statusCode, options);
                const excessivePenalty = checkExcessiveUsage(ipDataEntry, options);
                ipDataEntry.points += points + excessivePenalty;
                ipDataEntry.connections = Math.max(0, ipDataEntry.connections - 1);
                return originalSend.call(this, body);
            };
            next();
        };
        if (slowdownMs > 0)
            setTimeout(processRequest, slowdownMs);
        else
            processRequest();
    };
    const addPointsToIp = (ipOrReq, points) => {
        const ip = typeof ipOrReq === 'string' ? ipOrReq : getClientIp(ipOrReq);
        const data = ipData.get(ip);
        if (data) {
            data.points += points;
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
    return {
        middleware,
        addPointsToIp,
        getIpData,
        getStats
    };
}
exports.createPlastron = createPlastron;
