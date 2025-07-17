import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// =============================================================================
// CUSTOM METRICS CONFIGURATION
// =============================================================================

// Custom metrics for detailed performance tracking
const failureRate = new Rate('failed_requests');
const baselineResponseTime = new Trend('baseline_response_time');
const loadTestResponseTime = new Trend('load_test_response_time');
const requestCounter = new Counter('total_requests');

// =============================================================================
// LOAD TEST CONFIGURATION
// =============================================================================

export let options = {
  // Stage-based load testing configuration
  stages: [
    // Ramp-up phase: 0 to 1000 users over 15 seconds
    { duration: '15s', target: 1000 },
    // Sustained load phase: maintain 1000 users for 30 seconds
    { duration: '30s', target: 1000 },
    // Ramp-down phase: 1000 to 0 users over 15 seconds
    { duration: '15s', target: 0 }
  ],
  
  // Performance thresholds - test fails if these are exceeded
  thresholds: {
    // 95% of requests should complete within 2 seconds
    'http_req_duration': ['p(95)<2000'],
    // Error rate should be less than 5%
    'http_req_failed': ['rate<0.05'],
    // Average response time should be under 1 second
    'http_req_duration{expected_response:true}': ['avg<1000'],
    // Custom failure rate threshold
    'failed_requests': ['rate<0.1']
  },

  // User agent configuration for realistic simulation
  userAgent: 'K6LoadTest/1.0 (Performance Testing)',
  
  // Connection and timeout settings
  noConnectionReuse: false,
  noVUConnectionReuse: false
};

// =============================================================================
// TEST TARGET CONFIGURATION
// =============================================================================
const BASE_URL = 'https://jsonplaceholder.typicode.com';
const ENDPOINT = '/posts';

// =============================================================================
// SETUP PHASE - BASELINE MEASUREMENT
// =============================================================================

export function setup() {
  console.log('🚀 Starting K6 Load Test Setup Phase');
  console.log('📊 Measuring baseline performance...');
  
  // Measure baseline response time with a single request
  const baselineStart = Date.now();
  const baselineResponse = http.get(`${BASE_URL}${ENDPOINT}`);
  const baselineEnd = Date.now();
  const baselineDuration = baselineEnd - baselineStart;
  
  // Record baseline metrics
  baselineResponseTime.add(baselineDuration);
  
  // Validate baseline response
  const baselineCheck = check(baselineResponse, {
    'baseline response status is 200': (r) => r.status === 200,
    'baseline response time < 1000ms': (r) => r.timings.duration < 1000,
    'baseline response has valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    }
  });
  
  console.log(`✅ Baseline Response Time: ${baselineDuration}ms`);
  console.log(`✅ Baseline Status Code: ${baselineResponse.status}`);
  console.log(`✅ Baseline Response Size: ${baselineResponse.body.length} bytes`);
  
  // Return baseline data for use in main test and teardown
  return {
    baselineResponseTime: baselineDuration,
    baselineStatus: baselineResponse.status,
    baselineBodySize: baselineResponse.body.length,
    baselineHeaders: baselineResponse.headers,
    baselineBody: baselineResponse.body.substring(0, 200) + '...'
  };
}

// =============================================================================
// MAIN LOAD TEST EXECUTION
// =============================================================================

export default function(data) {
  // Simulate realistic user behavior with weighted endpoint selection
  const endpoints = [
    { url: `${BASE_URL}${ENDPOINT}`, weight: 100 }
  ];
  
  // Select endpoint based on weight distribution
  const random = Math.random() * 100;
  let cumulativeWeight = 0;
  let selectedEndpoint = endpoints[0].url;
  
  for (let endpoint of endpoints) {
    cumulativeWeight += endpoint.weight;
    if (random <= cumulativeWeight) {
      selectedEndpoint = endpoint.url;
      break;
    }
  }
  
  // Execute HTTP request with detailed configuration
  const response = http.get(selectedEndpoint, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'User-Agent': options.userAgent
    }
  });
  
  // Increment request counter
  requestCounter.add(1);
  
  // Record load test response time
  loadTestResponseTime.add(response.timings.duration);
  
  // Comprehensive response validation
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
    'response time < 5000ms': (r) => r.timings.duration < 5000,
    'response has content': (r) => r.body.length > 0,
    'response is valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
    'response contains expected data': (r) => r.body.includes('id'),
    'no server errors': (r) => r.status < 500
  });
  
  // Record failure rate
  failureRate.add(!success);
  
  // Log detailed information for failed requests
  if (!success) {
    console.log(`❌ Failed Request - Status: ${response.status}, Duration: ${response.timings.duration}ms, URL: ${selectedEndpoint}`);
  }
  
  // Simulate realistic user think time (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}

// =============================================================================
// TEARDOWN PHASE - RESULTS ANALYSIS
// =============================================================================

export function teardown(data) {
  console.log('\n🏁 K6 Load Test Teardown Phase');
  console.log('📈 Analyzing Performance Impact...\n');
  
  // Performance impact analysis would be enhanced with actual metrics
  // In a real scenario, you'd access K6's internal metrics here
  console.log('='.repeat(80));
  console.log('PERFORMANCE IMPACT ANALYSIS');
  console.log('='.repeat(80));
  
  console.log(`📊 Baseline Response Time: ${data.baselineResponseTime}ms`);
  console.log(`📊 Baseline Status Code: ${data.baselineStatus}`);
  console.log(`📊 Baseline Response Size: ${data.baselineBodySize} bytes`);
  
  console.log('\n🔍 Key Metrics to Monitor:');
  console.log('• Average Response Time (http_req_duration)');
  console.log('• 95th Percentile Response Time (http_req_duration{p95})');
  console.log('• Request Rate (http_reqs)');
  console.log('• Error Rate (http_req_failed)');
  console.log('• Throughput (data_received, data_sent)');
  
  console.log('\n📋 Test Summary:');
  console.log('• Target: JSONPlaceholder API');
  console.log('• Peak Load: 1000 concurrent users');
  console.log('• Duration: 60 seconds total');
  console.log('• Test Pattern: Ramp-up → Sustained Load → Ramp-down');
}
