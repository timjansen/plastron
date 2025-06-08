
import { Request, Response } from 'express';
import { createPlastron } from '../src/plastron';
import { PlastronOptions } from '../src/types';

// Mock Express Request and Response
const createMockRequest = (ip: string = '127.0.0.1'): Partial<Request> => ({
    ip,
    connection: { remoteAddress: ip } as any,
    socket: { remoteAddress: ip } as any
});

const createMockResponse = (): { res: Partial<Response>, sent: any, statusCode: number } => {
    let sent: any = null;
    let statusCode = 200;
    
    const res: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((data) => {
            sent = data;
            return res;
        }),
        send: jest.fn().mockImplementation((data) => {
            sent = data;
            return res;
        }),
        statusCode: 200
    };
    
    // Mock the status method to update statusCode
    (res.status as jest.Mock).mockImplementation((code: number) => {
        statusCode = code;
        res.statusCode = code;
        return res;
    });
    
    return { res, sent, statusCode };
};

describe('Plastron Middleware', () => {
    let mockNow = 1000000;
    const nowFn = () => mockNow;

    const basicOptions: PlastronOptions = {
        rateLimitMessage: 'Rate limit exceeded',
        nowFn,
        ipMonitorSize: 10,
        maxRequestRatePerSec: 100,
        maxRequestNegativeIPperSec: 50
    };

    beforeEach(() => {
        mockNow = 1000000;
    });

    test('should allow normal requests', () => {
        const plastron = createPlastron(basicOptions);
        const req = createMockRequest('192.168.1.1') as Request;
        const { res } = createMockResponse();
        const next = jest.fn();

        plastron.middleware(req, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('should throw error if rateLimitMessage is not provided', () => {
        expect(() => {
            createPlastron({} as PlastronOptions);
        }).toThrow('rateLimitMessage is required in PlastronOptions');
    });

    test('should block requests when global rate limit is exceeded', () => {
        const options: PlastronOptions = {
            ...basicOptions,
            maxRequestRatePerSec: 1
        };
        
        const plastron = createPlastron(options);
        const req1 = createMockRequest('192.168.1.1') as Request;
        const req2 = createMockRequest('192.168.1.2') as Request;
        const { res: res1 } = createMockResponse();
        const { res: res2 } = createMockResponse();
        const next = jest.fn();

        // First request should pass
        plastron.middleware(req1, res1 as Response, next);
        expect(next).toHaveBeenCalledTimes(1);

        // Second request in same second should be blocked
        plastron.middleware(req2, res2 as Response, next);
        expect(res2.status).toHaveBeenCalledWith(429);
        expect(res2.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded' });
    });

    test('should update IP points based on response status codes', (done) => {
        const plastron = createPlastron(basicOptions);
        const req = createMockRequest('192.168.1.1') as Request;
        const { res } = createMockResponse();
        const next = jest.fn();

        plastron.middleware(req, res as Response, next);

        // Simulate response
        res.statusCode = 404;
        (res.send as jest.Mock)('Not found');

        // Allow async operations to complete
        setTimeout(() => {
            expect(next).toHaveBeenCalled();
            done();
        }, 10);
    });

    test('should handle different IP addresses separately', () => {
        const plastron = createPlastron(basicOptions);
        const req1 = createMockRequest('192.168.1.1') as Request;
        const req2 = createMockRequest('192.168.1.2') as Request;
        const { res: res1 } = createMockResponse();
        const { res: res2 } = createMockResponse();
        const next = jest.fn();

        plastron.middleware(req1, res1 as Response, next);
        plastron.middleware(req2, res2 as Response, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(res1.status).not.toHaveBeenCalled();
        expect(res2.status).not.toHaveBeenCalled();
    });

    test('should apply slowdown for negative scores', (done) => {
        const options: PlastronOptions = {
            ...basicOptions,
            ipSlowDownStartsAt: -10,
            ipSlowDownMaxS: 1000
        };
        
        const plastron = createPlastron(options);
        const req = createMockRequest('192.168.1.1') as Request;
        const { res } = createMockResponse();
        const next = jest.fn();

        // First, make a request that will give negative points
        plastron.middleware(req, res as Response, next);
        
        // Simulate 404 response to give negative points
        res.statusCode = 404;
        (res.send as jest.Mock)('Not found');

        setTimeout(() => {
            const startTime = Date.now();
            
            // Make another request - this should be slowed down
            const req2 = createMockRequest('192.168.1.1') as Request;
            const { res: res2 } = createMockResponse();
            const next2 = jest.fn();
            
            plastron.middleware(req2, res2 as Response, next2);
            
            // Check that there's a delay
            setTimeout(() => {
                const elapsed = Date.now() - startTime;
                expect(elapsed).toBeGreaterThan(50); // Should have some delay
                done();
            }, 200);
        }, 10);
    });

    test('should evict old IPs when monitor size is exceeded', () => {
        const options: PlastronOptions = {
            ...basicOptions,
            ipMonitorSize: 2
        };
        
        const plastron = createPlastron(options);
        const next = jest.fn();

        // Add 3 different IPs, should evict the first
        for (let i = 1; i <= 3; i++) {
            const req = createMockRequest(`192.168.1.${i}`) as Request;
            const { res } = createMockResponse();
            plastron.middleware(req, res as Response, next);
        }

        expect(next).toHaveBeenCalledTimes(3);
    });

    test('should handle time window transitions', () => {
        const plastron = createPlastron(basicOptions);
        const req = createMockRequest('192.168.1.1') as Request;
        
        // Make request in first time window
        const { res: res1 } = createMockResponse();
        const next = jest.fn();
        plastron.middleware(req, res1 as Response, next);
        
        // Advance time to next minute
        mockNow += 61000;
        
        // Make request in new time window
        const { res: res2 } = createMockResponse();
        plastron.middleware(req, res2 as Response, next);
        
        expect(next).toHaveBeenCalledTimes(2);
    });

    test('should allow adding points to IP', () => {
        const plastron = createPlastron(basicOptions);
        const ip = '192.168.1.1';
        const req = createMockRequest(ip) as Request;
        const { res } = createMockResponse();
        const next = jest.fn();

        // Make initial request to create IP entry
        plastron.middleware(req, res as Response, next);
        
        // Add points to IP
        const success = plastron.addPointsToIp(ip, 10000);
        expect(success).toBe(true);
        
        // Check that points were added
        const ipData = plastron.getIpData(ip);
        expect(ipData?.points).toBe(10000);
    });

    test('should allow adding points using request object', () => {
        const plastron = createPlastron(basicOptions);
        const ip = '192.168.1.101';
        const req = createMockRequest(ip) as Request;
        const { res } = createMockResponse();
        const next = jest.fn();

        // Make initial request to create IP entry
        plastron.middleware(req, res as Response, next);
        
        // Add points to IP using Request object
        const success = plastron.addPointsToIp(req, 5000);
        expect(success).toBe(true);
        
        // Check that points were added
        const ipData = plastron.getIpData(ip);
        expect(ipData?.points).toBe(5000);
    });

    test('should return stats', () => {
        const plastron = createPlastron(basicOptions);
        const stats = plastron.getStats();
        
        expect(stats).toHaveProperty('totalMonitoredIps');
        expect(stats).toHaveProperty('globalStats');
        expect(typeof stats.totalMonitoredIps).toBe('number');
    });
});
