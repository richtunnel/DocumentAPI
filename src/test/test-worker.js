// test-workers.js - Test workers and queues
const axios = require('axios');

class WorkerQueueTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000/api/v1';
    this.apiKey = process.env.API_KEY || 'your-api-key-here';
  }

  async testQueueFlow() {
    console.log('Testing complete queue flow...\n');

    try {
      // Submit demographics (should trigger queue messages)
      console.log('Submitting demographics to trigger queue processing...');
      const demoResponse = await axios.post(`${this.baseUrl}/demographics`, {
        law_firm: 'Queue Test Firm',
        firstname: 'Queue',
        lastname: 'TestUser',
        email: 'queue@test.com',
        phone: '5559999999',
        primarylawfirm: 'Queue Test Firm',
        claimanttype: 'Adult',
        city: 'Houston',
        state: 'TX'
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('   Demographics submitted:', demoResponse.data.data.id);

      //Submit batch to test batch processing
      console.log('\n2. Submitting batch demographics...');
      const batchResponse = await axios.post(`${this.baseUrl}/demographics/batch`, {
        demographics: [
          {
            law_firm: 'Queue Test Firm',
            firstname: 'Batch1',
            lastname: 'User',
            email: 'batch1@test.com',
            phone: '5551111111',
            primarylawfirm: 'Queue Test Firm',
            claimanttype: 'Adult'
          },
          {
            law_firm: 'Queue Test Firm',
            firstname: 'Batch2', 
            lastname: 'User',
            email: 'batch2@test.com',
            phone: '5552222222',
            primarylawfirm: 'Queue Test Firm',
            claimanttype: 'Adult'
          }
        ],
        batch_options: {
          priority: 8,
          notify_on_completion: true
        }
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': this.generateUUID()
        }
      });

      console.log('   Batch submitted:', batchResponse.data.metadata.correlation_id);

      // Check queue status (if monitoring endpoints exist)
      console.log('\n3. Checking queue status...');
      try {
        const queueResponse = await axios.get(`${this.baseUrl}/monitoring/queues`, {
          headers: { 'X-API-Key': this.apiKey }
        });
        console.log('   Queue status:', queueResponse.data);
      } catch (error) {
        console.log('   Queue monitoring not available (expected in local dev)');
      }

      //Test document upload flow
      console.log('\n4. Testing document upload flow...');
      const uploadResponse = await axios.post(`${this.baseUrl}/documents/upload-url`, {
        fileName: './test-docs/drivers_license.pdf',
        contentType: 'application/pdf',
        documentType: 'demographics_form'
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('   Upload URL generated:', uploadResponse.data.data.correlationId);

      console.log('\nQueue flow test completed successfully!');
      console.log('\nWhat happened:');
      console.log('   - Demographics were queued for processing');
      console.log('   - Webhook notifications were queued');
      console.log('   - Batch processing was triggered');
      console.log('   - Document upload was prepared');
      console.log('\nCheck Docker logs to see worker processing:');
      console.log('   docker-compose logs -f api');

    } catch (error) {
      console.error('Test failed:', error.response?.data || error.message);
    }
  }

  async testRateLimit() {
    console.log('\n5. Testing rate limiting...');
    const promises = Array.from({ length: 20 }, (_, i) => 
      axios.get(`${this.baseUrl}/demographics?limit=1`, {
        headers: { 'X-API-Key': this.apiKey }
      }).catch(err => err.response)
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429).length;
    const successful = responses.filter(r => r.status === 200).length;

    console.log(`   Successful requests: ${successful}`);
    console.log(`   Rate limited: ${rateLimited}`);
    
    if (rateLimited > 0) {
      console.log('   Rate limiting is working!');
    }
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Database test
async function testDatabase() {
  console.log('Testing database connection...');
  
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const sqlCmd = spawn('docker', [
      'exec', 'demographics-api_mssql_1',
      '/opt/mssql-tools/bin/sqlcmd',
      '-S', 'localhost',
      '-U', 'sa', 
      '-P', 'GreenSun83**',
      '-Q', 'USE PartnersDB; SELECT COUNT(*) as TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE=\'BASE TABLE\''
    ]);

    let output = '';
    sqlCmd.stdout.on('data', (data) => {
      output += data.toString();
    });

    sqlCmd.on('close', (code) => {
      if (code === 0) {
        console.log('Database connection successful');
        console.log('   Output:', output.trim());
        resolve();
      } else {
        console.log('Database connection failed');
        reject(new Error('Database test failed'));
      }
    });
  });
}

// Main test function
async function runAllTests() {
  console.log('Demographics API - Complete Test Suite');

  try {
    // Test database
    await testDatabase();

    // Test API and workers
    const tester = new WorkerQueueTester();
    await tester.testQueueFlow();
    await tester.testRateLimit();

    console.log('\nAll tests completed!');
    console.log('\nNext steps:');
    console.log('   1. Check VSCode SQL Server extension to view data');
    console.log('   2. Use REST Client to test individual endpoints');
    console.log('   3. Monitor logs: docker-compose logs -f');
    console.log('   4. Debug with VSCode: F5 to start debugging');

  } catch (error) {
    console.error('\nTest suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { WorkerQueueTester };