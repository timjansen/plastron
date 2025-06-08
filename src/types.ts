export interface IpData {
    ip: string;
    index: number; // index in monitoredIps
    lastSeenMs: number; // ms since epoch. Set when a connection is opened.
    points: number;     // the score of the IP, negative may be blocked

    connections: number; // how many connections are currently open

    reqInCurrentMin: number;  // number of requests in the current minute (what the current minute is depends on lastSeenMs)
    reqInPrevMin: number;     // number of requests in the previous minute, copied from reqInCurrentMin if new minute started since lastSeenMs. 0 if no request in last minute.

    reqInCurrent10Sec: number;  // number of requests in the current 10 second window (what the current window is depends on lastSeenMs)
    reqInPrev10Sec: number;     // number of requests in the previous 10 second window, copied from reqInCurrent10Sec if new second started since lastSeenMs. 0 if no request in last 10 seconds.
}

export interface PlastronOptions {
    ipMonitorSize?: number;        // number of IPs to monitor. Default: 1000.
    maxRequestRatePerSec?: number; // upper limit of global requests per second. Any additional request in the current second will be rejected
    maxRequestNegativeIPperSec?: number; // upper limit of global requests per second for IPs with a negative score. Once reached, only positive IPs are allowed.

    maxSimultanousConnectionsPerIP?: number; // how many connection are allowed per IP for positive IPs, if not slowed down (score>ipSlowDownStartsAt). Default: 25.
    maxSimultanousConnectionsNegativePerIP?: number; // how many connection are allowed per IP for negative, if not slowed down (score>ipSlowDownStartsAt). Default: 10.

    maxReqPerSecPerIP?: number;         // how many req/s are allowed per IP for positive IPs, in a 10s window, for positive.  Default: 30.
    maxReqNegativePerSecPerIP?: number; // how many req/s are allowed per IP for negative score IPs, in a 10s window, for positive.  Default: 10.

    rateLimitMessage: string; // your service's own rate limiting message for HTTP errors. YOUR MUST SET YOUR OWN to make it more difficult for an attacker to recognize plastron.

    // requests will be slowed down and max connections limited if the user has a too negative score. The slow down will then increase linearly until the max has been reached.
    // Likewise, the number of simultanous connections will be lowered down to 1, when the user has ipSlowDownMaxPunishmentAt.
    ipSlowDownStartsAt?: number; // the (negative) score at which ips will be slowed down. Default: -100000
    ipSlowDownMaxS?: number;     // the max duration of slowing down. Default: 5s
    ipSlowDownMaxPunishmentAt?: number; // the (negative) score at which is the ipSlowDownMaxS is reached. Default: -500000.

    excessiveReqPerS?: number;          // more than this many req/s in a 10s window count as excessive. Default: 50.
    excessiveReqPerMin?: number;        // more than this many req/min count as excessive. Default: 200.
    pointsForExcessiveRequest?: number; // points/penalty per request for excessive use. Default: -100.

    pointsFor20x?: number; // points for a 20x response. Default: 1.
    pointsFor30x?: number; // points for a 30x response. Default: 0.
    pointsFor400?: number; // points/penalty for 400 (bad request) response. Default: -10000
    pointsFor401?: number; // points/penalty for 401 (unauthorized) response. Default: -10000
    pointsFor404?: number; // points/penalty for 404 (not found) response. Default: -100
    pointsFor40x?: number; // points/penalty for other 40x response. Default: -10
    pointsFor50x?: number; // points/penalty for other 50x response. Default: -20

    nowFn?: ()=>number;    // override for the default date function (function now(){ return Date.now() + randomModifier;}), for unit testing
    enableDebug?: boolean; // enable debug logging. Default: false.
    logger?: (msg: string) => void; // logger function for events. Default: undefined.
}

export interface GlobalStats {
    reqInCurrentSec: number;
    reqInPrevSec: number;
    prevSecStartMs: number;
    currentSecStartMs: number;
    negativeReqInCurrentSec: number;
    reqInCurrentMin: number;
    reqInPrevMin: number;
    rateLimited429InCurrentMin: number;
    rateLimited429InPrevMin: number;
    currentMinStartMs: number;
}
