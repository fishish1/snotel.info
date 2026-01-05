import { handler } from './index.mjs';

// Set environment variable
process.env.LOCAL_WRITE = '1';

// Create a test event
const testEvent = {
  state: 'CO' // Test with just Colorado
};

// Run the handler
console.log('Starting test...');
console.log('Environment variables:', {
  LOCAL_WRITE: process.env.LOCAL_WRITE,
  DRY_RUN: process.env.DRY_RUN
});

handler(testEvent, {})
  .then(() => {
    console.log('Test completed successfully');
  })
  .catch(err => {
    console.error('Test failed:', err);
  });
