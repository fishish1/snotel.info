# Generate State Data Script

This directory contains a Node.js script to generate SNOTEL data for various states.

## Setup

Before running the script, you need to install the required Node.js packages.

1.  **Install Dependencies**

    Open your terminal, navigate to this directory (`/Users/brian/Documents/snotel.info/lambda/functions/generateState`), and run the following command:

    ```bash
    npm install
    ```

    This will download all the dependencies listed in `package.json`.

## Running the Script

You can run the script to process all states or a single specified state directly from your command line.

### Process a Single State

To process a single state, pass the state's two-letter abbreviation as a command-line argument.

```bash
node index.js CO
```

### Process All States

To process all states defined in the `states` array in `index.js`, run the script without any arguments.

```bash
node index.js
```

## Running the Test

To run the test for a single state, execute the test script from your terminal.

1.  **Run the test script**

    Make sure you are in this directory and run:

    ```bash
    npm test
    ```

    The script is configured to test the state of 'CO' by default. You can change the `testState` variable in `test.js` to test other states.
