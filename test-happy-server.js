// Simple test to verify happy-server integration
const { createPlastron } = require('./dist/index');

// Mock happy-server extension
globalThis.happyServerExtension = {};

// Create plastron instance
const plastron = createPlastron({
    rateLimitMessage: 'Test rate limit'
});

// Check if plastron extension was added
console.log('Happy-server extension added:', 'plastron' in globalThis.happyServerExtension);

// Call the plastron function
const result = globalThis.happyServerExtension.plastron();
console.log('Plastron health data:', JSON.stringify(result, null, 2));

// Verify expected fields
const expectedFields = [
    'status',
    'totalMonitoredIps', 
    'positiveScoreIps',
    'negativeScoreIps',
    'worstIp',
    'rateLimited429LastMinute',
    'totalRequestsLastMinute',
    'globalRequestsPerSecond'
];

const missingFields = expectedFields.filter(field => !(field in result));
if (missingFields.length === 0) {
    console.log('✅ All expected fields are present');
} else {
    console.log('❌ Missing fields:', missingFields);
}
