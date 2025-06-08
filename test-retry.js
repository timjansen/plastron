// Test to verify happy-server retry mechanism
const { createPlastron } = require('./dist/plastron');

console.log('Testing happy-server retry mechanism...');

// Initially no happy-server extension
delete globalThis.happyServerExtension;

// Create plastron instance (should trigger retry after 3s)
console.log('Creating plastron instance without happy-server...');
const plastron = createPlastron({
    rateLimitMessage: 'Test rate limit'
});

// Check immediately - should not be registered yet
console.log('Initial check: happyServerExtension exists =', typeof globalThis.happyServerExtension !== 'undefined');

// Add happy-server extension after 1 second (before retry)
setTimeout(() => {
    console.log('Adding happy-server extension...');
    globalThis.happyServerExtension = {};
}, 1000);

// Check after 4 seconds (after retry should have happened)
setTimeout(() => {
    const hasExtension = globalThis.happyServerExtension && 'plastron' in globalThis.happyServerExtension;
    console.log('After retry check: plastron extension exists =', hasExtension);
    
    if (hasExtension) {
        const result = globalThis.happyServerExtension.plastron();
        console.log('✅ Retry mechanism works - plastron extension registered');
        console.log('Health data keys:', Object.keys(result));
    } else {
        console.log('❌ Retry mechanism failed');
    }
    
    process.exit(0);
}, 4000);
