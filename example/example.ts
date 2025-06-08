
import express from 'express';
import { createPlastron } from '../src/index';

const app = express();

// Create Plastron middleware with custom configuration
const plastronInstance = createPlastron({
    rateLimitMessage: 'Rate limit exceeded. Please slow down.',
    
    // Monitor up to 5000 IPs
    ipMonitorSize: 5000,
    
    // Global rate limits
    maxRequestRatePerSec: 1000,        // Max 1000 req/s globally
    maxRequestNegativeIPperSec: 100,   // Max 100 req/s for negative IPs
    
    // Per-IP connection limits
    maxSimultanousConnectionsPerIP: 50,         // 50 connections for positive IPs
    maxSimultanousConnectionsNegativePerIP: 5,  // 5 connections for negative IPs
    
    // Per-IP rate limits (10-second window)
    maxReqPerSecPerIP: 10,           // 10 req/s for positive IPs
    maxReqNegativePerSecPerIP: 5,    // 5 req/s for negative IPs
    
    // Slowdown configuration
    ipSlowDownStartsAt: -50000,      // Start slowing down at -50k points
    ipSlowDownMaxS: 10000,           // Max 10 second delay
    ipSlowDownMaxPunishmentAt: -200000, // Full punishment at -200k points
    
    // Excessive usage detection
    excessiveReqPerS: 25,            // More than 25 req/s is excessive
    excessiveReqPerMin: 100,         // More than 100 req/min is excessive
    pointsForExcessiveRequest: -500, // Heavy penalty for excessive use
    
    // Custom point system - more aggressive penalties
    pointsFor20x: 2,      // Reward successful requests more
    pointsFor30x: 1,      // Small reward for redirects
    pointsFor400: -25000, // Heavy penalty for bad requests
    pointsFor401: -50000, // Very heavy penalty for unauthorized
    pointsFor404: -5000,  // Moderate penalty for not found
    pointsFor40x: -1000,  // Penalty for other client errors
    pointsFor50x: -500,   // Smaller penalty for server errors (not client's fault)

    enableDebug: true,    // Enable debug logging
});

// Apply Plastron middleware globally
app.use(plastronInstance.middleware);

// Add middleware to parse JSON
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Welcome to the API!',
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/data', (req, res) => {
    res.json({
        data: 'Some important data',
        processed: true
    });
});

// Route that might return 404
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    
    // Simulate user lookup
    if (userId === '123') {
        res.json({ id: userId, name: 'John Doe', email: 'john@example.com' });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Route that requires authentication (might return 401)
app.post('/api/secure', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader !== 'Bearer valid-token') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({ message: 'Access granted to secure resource' });
});

// Login route - could reward successful authentication
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // Simulate authentication
    if (username === 'admin' && password === 'password') {
        // In a real app, you could reward the IP here:
        plastronInstance.addPointsToIp(req.ip || '127.0.0.1', 10000);
        
        res.json({ 
            success: true, 
            token: 'fake-jwt-token',
            message: 'Login successful'
        });
    } else {
        // Bad credentials result in 401, which gives heavy penalty
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Route that might cause server error
app.get('/api/error', (req, res) => {
    // Simulate occasional server error
    if (Math.random() < 0.1) {
        res.status(500).json({ error: 'Internal server error' });
    } else {
        res.json({ message: 'Everything is fine' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Plastron middleware is active and protecting your API!');
    console.log('\nTry these endpoints:');
    console.log(`  GET  http://localhost:${PORT}/`);
    console.log(`  GET  http://localhost:${PORT}/api/data`);
    console.log(`  GET  http://localhost:${PORT}/api/users/123`);
    console.log(`  GET  http://localhost:${PORT}/api/users/999  (will return 404)`);
    console.log(`  POST http://localhost:${PORT}/api/secure  (requires auth header)`);
    console.log(`  POST http://localhost:${PORT}/api/login`);
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log('\nMake rapid requests to see rate limiting in action!');
});
