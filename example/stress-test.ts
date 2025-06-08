
const BASE_URL = 'http://localhost:3000';

async function makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any): Promise<{ status: number, data: any, error?: string }> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method,
            body: data ? JSON.stringify(data) : undefined,
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        let responseData: any = null;
        try {
            const text = await response.text();
            responseData = text ? JSON.parse(text) : null;
        } catch {
            responseData = null;
        }
        
        return { status: response.status, data: responseData };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            return { status: 0, data: null, error: 'Request timeout' };
        }
        return { 
            status: 0, 
            data: null,
            error: error.message 
        };
    }
}

async function stressTest() {
    console.log('🚀 Starting Plastron stress test...');
    console.log('Make sure the example server is running: npm run example\n');

    // Test 1: Normal requests
    console.log('Test 1: Normal requests (should all succeed)');
    for (let i = 0; i < 5; i++) {
        const result = await makeRequest('/');
        console.log(`Request ${i + 1}: ${result.status} - ${result.data?.message || result.error}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }

    console.log('\nTest 2: Rapid requests (should start getting rate limited)');
    const promises: Promise<{ status: number, data: any, error?: string }>[] = [];
    for (let i = 0; i < 20; i++) {
        promises.push(makeRequest('/api/data'));
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 200).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    
    console.log(`Successful requests: ${successCount}`);
    console.log(`Rate limited requests: ${rateLimitedCount}`);

    console.log('\nTest 3: Triggering 404s (should get negative points)');
    for (let i = 0; i < 5; i++) {
        const result = await makeRequest('/nonexistent');
        console.log(`404 Request ${i + 1}: ${result.status}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\nTest 4: Unauthorized requests (should get heavy penalties)');
    for (let i = 0; i < 3; i++) {
        const result = await makeRequest('/api/secure', 'POST');
        console.log(`Unauthorized Request ${i + 1}: ${result.status}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\nTest 5: Successful login (should get rewards)');
    const loginResult = await makeRequest('/api/login', 'POST', {
        username: 'admin',
        password: 'password'
    });
    console.log(`Login: ${loginResult.status} - ${loginResult.data?.message || loginResult.error}`);

    console.log('\nTest 6: Bad login attempts (should get penalties)');
    for (let i = 0; i < 3; i++) {
        const result = await makeRequest('/api/login', 'POST', {
            username: 'admin',
            password: 'wrongpassword'
        });
        console.log(`Bad login ${i + 1}: ${result.status}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\nTest 7: Rapid requests after penalties (should be heavily rate limited)');
    const rapidPromises: Promise<{ status: number, data: any, error?: string }>[] = [];
    for (let i = 0; i < 15; i++) {
        rapidPromises.push(makeRequest('/'));
    }
    
    const rapidResults = await Promise.all(rapidPromises);
    const finalSuccessCount = rapidResults.filter(r => r.status === 200).length;
    const finalRateLimitedCount = rapidResults.filter(r => r.status === 429).length;
    
    console.log(`Final successful requests: ${finalSuccessCount}`);
    console.log(`Final rate limited requests: ${finalRateLimitedCount}`);

    console.log('\n✅ Stress test completed!');
    console.log('Expected behavior:');
    console.log('- Early requests should succeed');
    console.log('- Rapid requests should get rate limited');
    console.log('- 404s and unauthorized requests should lead to more rate limiting');
    console.log('- Successful login should help, but bad logins should make it worse');
}

if (require.main === module) {
    stressTest().catch(console.error);
}

export { stressTest };
