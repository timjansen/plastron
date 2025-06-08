# Plastron

Plastron is an Express middleware designed to protect SAAS services from abuse by implementing intelligent rate limiting and IP scoring.

## Features

- **Smart IP Scoring**: Tracks IP behavior with a point-based system where good requests earn positive points and suspicious/abusive requests earn negative points
- **Adaptive Rate Limiting**: Rate limits adjust based on IP reputation
- **Connection Management**: Limits simultaneous connections per IP based on their score
- **Rewards System**: Unlike other rate limiters, Plastron allows applications to reward good users (registered users, admins, paying customers) with bonus points
- **Security Focused**: Uses randomized timing to make attack patterns harder to predict
- **Configurable Penalties**: Different HTTP status codes result in different point penalties

## Installation

```bash
npm install plastron
```

## Basic Usage

```typescript
import express from 'express';
import { createPlastron } from 'plastron';

const app = express();

// Create Plastron instance
const plastron = createPlastron({
    rateLimitMessage: 'Too many requests, please slow down',
    maxRequestRatePerSec: 1000,
    maxRequestNegativeIPperSec: 100,
    ipMonitorSize: 5000
});

// Apply middleware
app.use(plastron.middleware);

// Your routes
app.get('/', (req, res) => {
    res.json({ message: 'Hello World!' });
});

app.listen(3000);
```

## Configuration Options

```typescript
interface PlastronOptions {
    // Required
    rateLimitMessage: string; // Your custom rate limit message

    // IP Monitoring
    ipMonitorSize?: number; // Number of IPs to monitor (default: 1000)

    // Global Rate Limits
    maxRequestRatePerSec?: number; // Global requests/sec limit (0 = disabled)
    maxRequestNegativeIPperSec?: number; // Limit for negative IPs (0 = disabled)

    // Per-IP Connection Limits
    maxSimultanousConnectionsPerIP?: number; // Max connections for positive IPs (default: 25)
    maxSimultanousConnectionsNegativePerIP?: number; // Max connections for negative IPs (default: 10)

    // Per-IP Rate Limits (10-second window)
    maxReqPerSecPerIP?: number; // Rate limit for positive IPs (default: 30)
    maxReqNegativePerSecPerIP?: number; // Rate limit for negative IPs (default: 10)

    // Slowdown Configuration
    ipSlowDownStartsAt?: number; // Score threshold for slowdowns (default: -100000)
    ipSlowDownMaxS?: number; // Maximum slowdown time in ms (default: 5000)
    ipSlowDownMaxPunishmentAt?: number; // Score for maximum punishment (default: -500000)

    // Excessive Usage Detection
    excessiveReqPerS?: number; // Requests/sec considered excessive (default: 50)
    excessiveReqPerMin?: number; // Requests/min considered excessive (default: 200)
    pointsForExcessiveRequest?: number; // Penalty for excessive requests (default: -100)

    // Point System
    pointsFor20x?: number; // Points for 2xx responses (default: 1)
    pointsFor30x?: number; // Points for 3xx responses (default: 0)
    pointsFor400?: number; // Points for 400 responses (default: -10000)
    pointsFor401?: number; // Points for 401 responses (default: -10000)
    pointsFor404?: number; // Points for 404 responses (default: -100)
    pointsFor40x?: number; // Points for other 4xx responses (default: -10)
    pointsFor50x?: number; // Points for 5xx responses (default: -20)

    // Testing
    nowFn?: () => number; // Override time function for testing
}
```

## Advanced Usage

### Rewarding Good Users

```typescript
import { createPlastron } from 'plastron';

const plastron = createPlastron({
    rateLimitMessage: 'Rate limit exceeded'
});

app.use(plastron.middleware);

// Reward authenticated users
app.post('/login', async (req, res) => {
    const user = await authenticateUser(req.body);
    if (user) {
        // Reward successful login
        plastron.addPointsToIp(req, 10000);
        
        if (user.isPremium) {
            // Extra points for premium users
            plastron.addPointsToIp(req, 50000);
        }
    }
    res.json({ success: true });
});

// Monitor IP statistics
app.get('/admin/stats', (req, res) => {
    const stats = plastron.getStats();
    const ipData = plastron.getIpData(req.ip || '127.0.0.1');
    
    res.json({
        globalStats: stats,
        yourIpData: ipData
    });
});
```

### Custom Configuration

```typescript
const plastron = createPlastron({
    rateLimitMessage: 'Service temporarily unavailable',
    ipMonitorSize: 10000, // Monitor more IPs
    maxRequestRatePerSec: 500, // Lower global limit
    maxRequestNegativeIPperSec: 50, // Strict limit for bad IPs
    
    // More aggressive penalties
    pointsFor404: -1000,
    pointsFor401: -50000,
    
    // Faster slowdowns
    ipSlowDownStartsAt: -50000,
    ipSlowDownMaxS: 10000,
    
    // Stricter excessive usage detection
    excessiveReqPerS: 20,
    pointsForExcessiveRequest: -500
});

app.use(plastron.middleware);
```

## API Reference

### PlastronInstance

The `createPlastron()` function returns a `PlastronInstance` object with the following methods:

#### `middleware`
Express middleware function to be used with `app.use()`.

#### `addPointsToIp(ipOrReq: string | Request, points: number): boolean`
Manually add or subtract points from an IP address. You can pass either an IP string or an Express Request object for convenience. Returns `true` if the IP was found and updated, `false` otherwise.

**Examples:**
```javascript
// Using IP string
plastron.addPointsToIp('192.168.1.100', 10000);

// Using Express Request object (recommended)
plastron.addPointsToIp(req, 10000);
```

#### `getIpData(ip: string): IpData | undefined`
Get the current data for a specific IP address, including points and request statistics.

#### `getStats(): { totalMonitoredIps: number; globalStats: GlobalStats }`
Get global statistics about the middleware's current state.
```

## How It Works

### IP Scoring System

- **Positive Points**: Successful requests (2xx responses) earn points
- **Negative Points**: Error responses, especially 401/400/404, lose points
- **Excessive Usage**: IPs making too many requests get penalties
- **Rewards**: Applications can manually add points for good behavior

### Rate Limiting Behavior

1. **Global Limits**: Hard limits on total requests per second
2. **IP-Based Limits**: Different limits for positive vs negative scored IPs
3. **Connection Limits**: Maximum simultaneous connections per IP
4. **Progressive Slowdowns**: Negative IPs get increasingly delayed responses

### Time Windows

- **Current/Previous Seconds**: For real-time rate calculations
- **10-Second Windows**: For burst detection and IP-specific rate limiting
- **Minute Windows**: For broader usage pattern analysis

### Security Features

- **Unpredictable Timing**: Random offset added to time calculations
- **Smart Eviction**: Protects VIPs and persistent abusers from being evicted
- **Progressive Punishment**: Linear increase in penalties as scores worsen

## Testing

```bash
npm test
```

## License

MIT
