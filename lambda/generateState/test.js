const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define the state you want to test
const testState = 'CO'; // Change this to any state, e.g., 'UT', 'WA'
const writeToS3 = process.argv.includes('--write-to-s3');

console.log(`--- Running generateState test for state: ${testState} ---`);

const command = `node index.mjs ${testState}`;
const expectedFilename = `${testState}.json`;

exec(command, writeToS3 ? {} : { env: { ...process.env, DRY_RUN: 'true', LOCAL_WRITE: '1' } }, (error, stdout, stderr) => {
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

    // Check if the expected file exists
    if (!writeToS3) {
        if (fs.existsSync(path.join(__dirname, expectedFilename))) {
            console.log(`Success: Local file "${expectedFilename}" was created.`);
            process.exit(0);
        } else {
            console.error(`Failure: Local file "${expectedFilename}" was NOT created.`);
            process.exit(2);
        }
    } else {
        console.log('Test succeeded (S3 mode, file existence not checked).');
        process.exit(0);
    }
});
