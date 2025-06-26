const { exec } = require('child_process');

// Define the state you want to test
const testState = 'CO'; // Change this to any state, e.g., 'UT', 'WA'

console.log(`--- Running generateState test for state: ${testState} ---`);

const command = `node index.js ${testState}`;

exec(command, (error, stdout, stderr) => {
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
