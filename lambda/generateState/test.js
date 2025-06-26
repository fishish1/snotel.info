const { exec } = require('child_process');

// Define the state you want to test
const testState = 'CO'; // Change this to any state, e.g., 'UT', 'WA'
const writeToS3 = process.argv.includes('--write-to-s3');

console.log(`--- Running generateState test for state: ${testState} ---`);

const command = `node index.js ${testState}`;

// To prevent writing to S3 during tests, we set the DRY_RUN environment variable.
// Your index.js should check for `process.env.DRY_RUN` to skip the S3 upload.
// To test writing to S3, run this script with the --write-to-s3 flag.
exec(command, writeToS3 ? {} : { env: { ...process.env, DRY_RUN: 'true' } }, (error, stdout, stderr) => {
    console.log('--- Test execution finished ---');
    if (error) {
        console.error(`Test failed with error: ${error.message}`);
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
        process.exit(1);
        return;
    }
    if (stderr) {
        console.warn(`stderr: ${stderr}`);
    }
    console.log(`stdout: ${stdout}`);
    console.log('Test succeeded.');
    process.exit(0);
});
